"""Отправка писем через SMTP (например, Яндекс 360 / Mail.ru для домена). Необязательно."""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from ..config import get_settings


def enabled() -> bool:
    c = get_settings()
    return bool(c.smtp_host and c.smtp_user and c.smtp_password)


def send(to: str, subject: str, text: str) -> None:
    c = get_settings()
    msg = EmailMessage()
    msg["From"] = c.smtp_from or c.smtp_user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if c.smtp_port == 465:
        with smtplib.SMTP_SSL(c.smtp_host, c.smtp_port, context=ssl.create_default_context(), timeout=30) as smtp:
            smtp.login(c.smtp_user, c.smtp_password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(c.smtp_host, c.smtp_port, timeout=30) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(c.smtp_user, c.smtp_password)
            smtp.send_message(msg)
