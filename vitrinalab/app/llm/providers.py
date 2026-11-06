"""Провайдеры LLM и генерации изображений, доступные из РФ.

* YandexGPT / YandexART — Yandex Cloud Foundation Models (API-ключ сервисного аккаунта + folder id)
* GigaChat — Сбер (ключ авторизации; нужен сертификат НУЦ Минцифры)
* mock — без внешних вызовов: агенты используют свои детерминированные запасные алгоритмы
"""
from __future__ import annotations

import base64
import json
import re
import threading
import time
import uuid
from dataclasses import dataclass

import httpx

from ..config import Settings, get_settings


@dataclass
class LLMResult:
    text: str
    tokens_in: int = 0
    tokens_out: int = 0


class LLMUnavailable(Exception):
    pass


class BaseLLM:
    name = "base"

    def complete(self, system: str, user: str, temperature: float = 0.4, max_tokens: int = 2000) -> LLMResult:
        raise NotImplementedError


class MockLLM(BaseLLM):
    """Не делает внешних вызовов. Сигнализирует агентам использовать запасной алгоритм."""

    name = "mock"

    def complete(self, system, user, temperature=0.4, max_tokens=2000):
        raise LLMUnavailable("LLM не подключён (mock)")


class YandexGPT(BaseLLM):
    name = "yandex"
    URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"

    def __init__(self, cfg: Settings):
        if not (cfg.yandex_api_key and cfg.yandex_folder_id):
            raise LLMUnavailable("нет YANDEX_API_KEY / YANDEX_FOLDER_ID")
        self.cfg = cfg

    def complete(self, system, user, temperature=0.4, max_tokens=2000):
        body = {
            "modelUri": f"gpt://{self.cfg.yandex_folder_id}/{self.cfg.yandex_model}",
            "completionOptions": {"stream": False, "temperature": temperature, "maxTokens": str(max_tokens)},
            "messages": [{"role": "system", "text": system}, {"role": "user", "text": user}],
        }
        headers = {"Authorization": f"Api-Key {self.cfg.yandex_api_key}", "x-folder-id": self.cfg.yandex_folder_id}
        r = httpx.post(self.URL, json=body, headers=headers, timeout=90)
        r.raise_for_status()
        res = r.json()["result"]
        usage = res.get("usage", {})
        return LLMResult(
            text=res["alternatives"][0]["message"]["text"],
            tokens_in=int(usage.get("inputTextTokens", 0)),
            tokens_out=int(usage.get("completionTokens", 0)),
        )


class GigaChat(BaseLLM):
    name = "gigachat"
    OAUTH = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"
    _lock = threading.Lock()
    _token: tuple[str, float] | None = None

    def __init__(self, cfg: Settings):
        if not cfg.gigachat_auth_key:
            raise LLMUnavailable("нет GIGACHAT_AUTH_KEY")
        self.cfg = cfg
        self.verify = cfg.gigachat_ca_bundle or True

    def _access_token(self) -> str:
        with self._lock:
            if GigaChat._token and GigaChat._token[1] > time.time() + 60:
                return GigaChat._token[0]
            r = httpx.post(
                self.OAUTH,
                headers={"Authorization": f"Basic {self.cfg.gigachat_auth_key}", "RqUID": str(uuid.uuid4())},
                data={"scope": self.cfg.gigachat_scope},
                timeout=30,
                verify=self.verify,
            )
            r.raise_for_status()
            d = r.json()
            GigaChat._token = (d["access_token"], d["expires_at"] / 1000)
            return d["access_token"]

    def complete(self, system, user, temperature=0.4, max_tokens=2000):
        body = {
            "model": self.cfg.gigachat_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        r = httpx.post(
            self.URL,
            json=body,
            headers={"Authorization": f"Bearer {self._access_token()}"},
            timeout=90,
            verify=self.verify,
        )
        r.raise_for_status()
        d = r.json()
        usage = d.get("usage", {})
        return LLMResult(
            text=d["choices"][0]["message"]["content"],
            tokens_in=usage.get("prompt_tokens", 0),
            tokens_out=usage.get("completion_tokens", 0),
        )


def get_llm(cfg: Settings | None = None) -> BaseLLM:
    cfg = cfg or get_settings()
    try:
        if cfg.llm_provider == "yandex":
            return YandexGPT(cfg)
        if cfg.llm_provider == "gigachat":
            return GigaChat(cfg)
    except LLMUnavailable:
        pass
    return MockLLM()


# ---------------- изображения ----------------


class ImageUnavailable(Exception):
    pass


class YandexART:
    URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync"
    OPS = "https://llm.api.cloud.yandex.net:443/operations/"

    def __init__(self, cfg: Settings):
        if not (cfg.yandex_api_key and cfg.yandex_folder_id):
            raise ImageUnavailable("нет ключей Yandex Cloud")
        self.cfg = cfg

    def generate(self, prompt: str, seed: int = 1, w: int = 3, h: int = 4, timeout_s: int = 120) -> bytes:
        headers = {"Authorization": f"Api-Key {self.cfg.yandex_api_key}"}
        body = {
            "modelUri": f"art://{self.cfg.yandex_folder_id}/yandex-art/latest",
            "generationOptions": {"seed": str(seed), "aspectRatio": {"widthRatio": str(w), "heightRatio": str(h)}},
            "messages": [{"weight": "1", "text": prompt}],
        }
        r = httpx.post(self.URL, json=body, headers=headers, timeout=60)
        r.raise_for_status()
        op_id = r.json()["id"]
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            time.sleep(4)
            o = httpx.get(self.OPS + op_id, headers=headers, timeout=30)
            o.raise_for_status()
            d = o.json()
            if d.get("done"):
                if "error" in d:
                    raise ImageUnavailable(str(d["error"]))
                return base64.b64decode(d["response"]["image"])
        raise ImageUnavailable("таймаут генерации")


def get_image_gen(cfg: Settings | None = None):
    cfg = cfg or get_settings()
    if cfg.image_provider == "yandexart":
        try:
            return YandexART(cfg)
        except ImageUnavailable:
            return None
    return None


# ---------------- утилиты ----------------


def extract_json(text: str):
    """Достать JSON из ответа модели (модели любят оборачивать его в ```json)."""
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise ValueError("в ответе нет JSON")
    end = max(text.rfind("}"), text.rfind("]"))
    return json.loads(text[start : end + 1])
