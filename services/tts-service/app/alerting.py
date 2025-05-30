"""
Alerting utilities: Slack and email notifications
"""
import smtplib
import requests
from email.mime.text import MIMEText
from app.config import Config

def send_slack_alert(message: str):
    """Post message to Slack via webhook"""
    url = Config.SLACK_WEBHOOK_URL
    if not url:
        return
    try:
        requests.post(url, json={"text": message})
    except Exception:
        pass


def send_email_alert(subject: str, body: str):
    """Send email alert to configured recipients"""
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = Config.EMAIL_SENDER
    msg['To'] = ','.join(Config.EMAIL_RECIPIENTS)
    try:
        server = smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT)
        if Config.SMTP_TLS:
            server.starttls()
        if Config.SMTP_USER:
            server.login(Config.SMTP_USER, Config.SMTP_PASSWORD)
        server.sendmail(Config.EMAIL_SENDER, Config.EMAIL_RECIPIENTS, msg.as_string())
        server.quit()
    except Exception:
        pass
