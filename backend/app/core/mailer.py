"""Envoi d'emails transactionnels (SMTP).

- Sans SMTP_HOST (développement) : l'email est écrit dans les journaux, rien n'est envoyé.
- En test : les emails sont conservés dans OUTBOX pour les assertions.
Un échec d'envoi est journalisé mais ne fait jamais échouer l'action métier.
"""

import html
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

import structlog
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings

log = structlog.get_logger()


@dataclass
class Email:
    to: str
    subject: str
    text: str
    html: str


OUTBOX: list[Email] = []  # rempli uniquement en environnement de test


def _layout(title: str, paragraphs: list[str], button: tuple[str, str] | None = None) -> str:
    body = "".join(f'<p style="margin:0 0 14px">{p}</p>' for p in paragraphs)
    if button:
        label, url = button
        body += (
            f'<p style="margin:24px 0"><a href="{html.escape(url)}" style="background:#ea580c;color:#fff;'
            f'padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">{html.escape(label)}</a></p>'
            f'<p style="font-size:12px;color:#737373">Si le bouton ne fonctionne pas, copiez ce lien :<br>'
            f"{html.escape(url)}</p>"
        )
    return (
        '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;'
        'color:#171717"><p style="font-weight:800;font-size:18px;color:#ea580c">OmegaSen</p>'
        f'<h1 style="font-size:20px">{html.escape(title)}</h1>{body}'
        '<p style="font-size:12px;color:#a3a3a3;margin-top:32px">Email automatique, merci de ne pas répondre.</p></div>'
    )


def build(subject: str, title: str, paragraphs: list[str], button: tuple[str, str] | None = None) -> tuple[str, str]:
    """Retourne (texte, html). Les paragraphes sont du texte brut (échappé pour le HTML)."""
    text = "\n\n".join([title, *paragraphs] + ([f"{button[0]} : {button[1]}"] if button else []))
    return text, _layout(title, [html.escape(p) for p in paragraphs], button)


def _send_smtp(msg: EmailMessage) -> None:
    s = get_settings()
    if s.smtp_ssl:
        with smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, context=ssl.create_default_context(), timeout=15) as smtp:
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password or "")
            smtp.send_message(msg)
        return
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
        if s.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password or "")
        smtp.send_message(msg)


async def send_email(to: str, subject: str, text: str, html_body: str) -> bool:
    s = get_settings()
    if s.environment == "test":
        OUTBOX.append(Email(to, subject, text, html_body))
        return True
    if not s.smtp_host:
        log.info("email_not_sent_no_smtp", to=to, subject=subject, body=text)
        return False
    msg = EmailMessage()
    msg["From"] = s.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")
    try:
        await run_in_threadpool(_send_smtp, msg)
        log.info("email_sent", to=to, subject=subject)
        return True
    except Exception:
        log.exception("email_failed", to=to, subject=subject)
        return False
