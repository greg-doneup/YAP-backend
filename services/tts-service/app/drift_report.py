#!/usr/bin/env python3
"""
Daily drift report script: load baseline and sampled data, compute data drift report with Evidently,
and upload report HTML and JSON to object store.
"""
import os
import io
import datetime
import pandas as pd
import boto3
from evidently.report import Report
from evidently.metric_preset import DataDriftPreset
from app.config import Config


def generate_drift_report(date_str: str = None):
    # Initialize S3 client
    s3 = boto3.client('s3')
    bucket = Config.DRIFT_SAMPLING_BUCKET

    # Determine dates
    if not date_str:
        date_str = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    sample_key = f"{Config.DRIFT_SAMPLING_PREFIX}/{date_str}/sample.csv"
    baseline_key = Config.BASELINE_SAMPLE_PATH

    # Load datasets
    try:
        sample_obj = s3.get_object(Bucket=bucket, Key=sample_key)
        sample_df = pd.read_csv(io.BytesIO(sample_obj['Body'].read()))
    except Exception as e:
        print(f"Error loading sample data: {e}")
        return

    try:
        baseline_obj = s3.get_object(Bucket=bucket, Key=baseline_key)
        baseline_df = pd.read_csv(io.BytesIO(baseline_obj['Body'].read()))
    except Exception as e:
        print(f"Error loading baseline data: {e}")
        return

    # Compute data drift report
    report = Report(metrics=[DataDriftPreset()])
    report.run(reference_data=baseline_df, current_data=sample_df)

    # Prepare outputs
    html_buf = io.StringIO()
    json_buf = io.StringIO()
    report.save_html(html_buf)
    report.save_json(json_buf)

    # Upload reports
    report_prefix = f"{Config.DRIFT_REPORT_PREFIX}/{date_str}"
    html_key = f"{report_prefix}/report.html"
    json_key = f"{report_prefix}/report.json"

    s3.put_object(Bucket=bucket, Key=html_key, Body=html_buf.getvalue(), ContentType='text/html')
    s3.put_object(Bucket=bucket, Key=json_key, Body=json_buf.getvalue(), ContentType='application/json')

    print(f"Drift report uploaded to s3://{bucket}/{html_key} and {json_key}")


if __name__ == '__main__':
    generate_drift_report()
