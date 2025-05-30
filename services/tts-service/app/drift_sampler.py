#!/usr/bin/env python3
"""
Daily sampler job: read raw logs from object store,
sample up to DRIFT_SAMPLING_SIZE records,
and upload sample CSV to object store.
"""
import os
import io
import datetime
import pandas as pd
import boto3
from app.config import Config

def sample_raw_logs(date_str: str = None):
    # Initialize S3 client
    s3 = boto3.client('s3')

    # Default to yesterday's date if not provided
    if not date_str:
        date_str = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    prefix = f"{Config.DRIFT_RAW_LOGS_PREFIX}/{date_str}/"
    bucket = Config.DRIFT_SAMPLING_BUCKET

    # List objects under the date prefix
    resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
    items = resp.get('Contents', [])
    if not items:
        print(f"No raw log objects found under {prefix}")
        return

    # Load dataframes
    dfs = []
    for obj in items:
        key = obj['Key']
        body = s3.get_object(Bucket=bucket, Key=key)['Body'].read()
        if key.lower().endswith('.csv'):
            df = pd.read_csv(io.BytesIO(body))
        else:
            df = pd.read_json(io.BytesIO(body), lines=True)
        dfs.append(df)

    full_df = pd.concat(dfs, ignore_index=True)
    sample_n = min(Config.DRIFT_SAMPLING_SIZE, len(full_df))
    sample_df = full_df.sample(n=sample_n, random_state=42)

    # Serialize and upload
    out_key = f"{Config.DRIFT_SAMPLING_PREFIX}/{date_str}/sample.csv"
    buf = io.StringIO()
    sample_df.to_csv(buf, index=False)
    s3.put_object(Bucket=bucket, Key=out_key, Body=buf.getvalue())
    print(f"Sampled {sample_n} records and uploaded to s3://{bucket}/{out_key}")

if __name__ == '__main__':
    sample_raw_logs()
