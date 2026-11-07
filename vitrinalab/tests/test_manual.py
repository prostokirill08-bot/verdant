"""Режим ChatGPT: задания владельцу, приём картинок, превью, комплект, доставка."""
import shutil
import zipfile

from PIL import Image
from sqlalchemy import select

from app.db import session_scope
from app.models import ManualJob, Order, OrderItem
from app.queue import run_pending
from tests.conftest import FEATURES
from tests.test_integrations import _cb, _owner_msg, _upd


def _owner_photo(uid, file_id="gpt"):
    return {"update_id": uid, "message": {"message_id": uid, "chat": {"id": 999, "type": "private"}, "from": {"id": 999}, "document": {"file_id": file_id, "mime_type": "image/png"}}}


def test_chatgpt_mode_end_to_end(tg, monkeypatch, product_photo, tmp_path):
    from app.agents import sales
    from app.events import owner_code
    from app.integrations import telegram

    gpt = tmp_path / "gpt.png"  # ChatGPT отдаёт 2:3
    Image.new("RGB", (1024, 1536), (20, 90, 60)).save(gpt)

    def fake_download(fid, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(gpt if fid.startswith("gpt") else product_photo, dest)
        return dest

    monkeypatch.setattr(telegram, "download_file", fake_download)

    with session_scope() as s:
        sales.handle_update(s, _owner_msg(f"/owner {owner_code()}"))
        sales.handle_update(s, _owner_msg("/mode chatgpt", uid=101))
    assert "ChatGPT" in tg[-1][1]

    # клиент
    with session_scope() as s:
        sales.handle_update(s, _upd("/start", uid=1))
        sales.handle_update(s, _upd(photo=True, uid=2))
        sales.handle_update(s, _upd("Набор ёлочных игрушек\n" + FEATURES + "\nWB", uid=3))
    assert "дизайнер" in tg[-1][1]
    run_pending()  # задание владельцу
    texts = " ".join(m[1] for m in tg)
    assert "Задание №1" in texts and "товар — строго как на прикреплённом фото" in texts and "новогодняя атмосфера" in texts
    assert any(m[0] == "doc" for m in tg)

    # владелец присылает картинку из ChatGPT
    with session_scope() as s:
        sales.handle_callback(s, _cb("mjob:1"))
        sales.handle_update(s, _owner_photo(200))
        sales.handle_update(s, _owner_msg("готово", uid=201))
    assert "Проверяю" in tg[-1][1]  # бот отвечает сразу, проверка — в фоне
    run_pending()
    assert "Отправить клиенту" in str(tg[-1][2])
    with session_scope() as s:
        job = s.get(ManualJob, 1)
        assert job.status == "review"
        assert Image.open(job.images[0]["path"]).size == (1440, 1920)
        sales.handle_callback(s, _cb("msend:1"))
        sales.handle_callback(s, _cb("msend:1"))  # нетерпеливое повторное нажатие
    assert "повторно нажимать не нужно" in tg[-1][1]
    run_pending()
    with session_scope() as s:
        item = s.scalar(select(OrderItem))
        assert item.status == "preview_ready" and Image.open(item.preview_path).size == (1440, 1920)
        oid = item.order_id
    assert any(m[0] == "photo" and "превью" in m[1] for m in tg)  # клиент получил превью

    # оплата: тариф «Старт» (5 слайдов) → «Я оплатил» → владелец подтверждает
    with session_scope() as s:
        sales.handle_callback(s, {"id": "t", "data": f"tariff:{oid}:start", "message": {"chat": {"id": 777}}})
        sales.handle_callback(s, {"id": "p", "data": f"paid:{oid}", "message": {"chat": {"id": 777}}})
    run_pending()
    okpay = next(m for m in reversed(tg) if m[2] and "okpay" in str(m[2]))[2]["inline_keyboard"][0][0]["callback_data"]
    with session_scope() as s:
        sales.handle_callback(s, _cb(okpay))
    run_pending()  # производство → задание на комплект
    with session_scope() as s:
        job = s.scalar(select(ManualJob).where(ManualJob.stage == "final"))
        assert len(job.prompts) == 5 and "СЛАЙД 2 из 5" in job.prompts[1]
        jid = job.id
    with session_scope() as s:
        sales.handle_callback(s, _cb(f"mjob:{jid}"))
        for i in range(5):
            sales.handle_update(s, _owner_photo(300 + i, f"gpt{i}"))
        sales.handle_callback(s, _cb(f"mdone:{jid}"))
    run_pending()
    with session_scope() as s:
        sales.handle_callback(s, _cb(f"msend:{jid}"))
    run_pending()
    with session_scope() as s:
        order = s.get(Order, oid)
        assert order.status == "delivered"
        names = zipfile.ZipFile(order.items[0].zip_path).namelist()
        assert "SEO.txt" in names and len([n for n in names if n.endswith(".jpg")]) == 5
    assert any(m[0] == "doc" and m[1].endswith(".zip") for m in tg)


def test_owner_photos_without_job_go_to_client_flow(tg):
    """Владелец может тестировать бота как клиент: без открытого задания его фото — это товар."""
    from app.agents import sales
    from app.events import owner_code

    with session_scope() as s:
        sales.handle_update(s, _owner_msg(f"/owner {owner_code()}"))
        upd = _owner_photo(400, "product")
        sales.handle_update(s, upd)
    assert "Фото получил" in tg[-1][1]
