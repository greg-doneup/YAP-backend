"""
Airflow DAG for batch audio-quality scoring and backfill
"""
from airflow import DAG
from airflow.operators.bash import BashOperator
from datetime import datetime, timedelta

# Default arguments
default_args = {
    'owner': 'mlops',
    'depends_on_past': False,
    'start_date': datetime(2025, 5, 1),
    'email': ['ml-team@yap.ai'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=30),
}

with DAG(
    dag_id='tts_audio_quality_batch',
    default_args=default_args,
    description='Batch job to compute audio-quality scores and backfill feature store',
    schedule_interval='0 4 * * *',  # daily at 04:00 UTC
    catchup=False,
) as dag:

    score_task = BashOperator(
        task_id='score_audio_quality',
        bash_command='python /opt/airflow/app/audio_quality_batch.py',
    )

    score_task
