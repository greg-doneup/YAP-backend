#!/usr/bin/env python3
"""
Check drift report against threshold and send alerts
"""
import json
import datetime
import boto3
from app.config import Config
from app.alerting import send_slack_alert, send_email_alert

def check_drift(date_str: str = None):
    if not date_str:
        date_str = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    bucket = Config.DRIFT_SAMPLING_BUCKET
    key = f"{Config.DRIFT_REPORT_PREFIX}/{date_str}/report.json"
    s3 = boto3.client('s3')
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        report = json.loads(obj['Body'].read())
    except Exception as e:
        print(f"Error fetching drift report: {e}")
        return

    alerts = []
    for metric in report.get('metrics', []):
        for m in metric.get('metrics', []):
            val = m.get('value', 0)
            if val > Config.DRIFT_ALERT_THRESHOLD:
                alerts.append((m.get('name'), val))

    if alerts:
        lines = [f"Data drift detected on {date_str}, threshold={Config.DRIFT_ALERT_THRESHOLD}"]
        for name, val in alerts:
            lines.append(f"- {name}: {val:.3f}")
        message = "\n".join(lines)
        send_slack_alert(message)
        send_email_alert(f"[YAP TTS] Drift Alert {date_str}", message)
    else:
        print(f"No significant drift (threshold={Config.DRIFT_ALERT_THRESHOLD})")

if __name__ == '__main__':
    check_drift()
