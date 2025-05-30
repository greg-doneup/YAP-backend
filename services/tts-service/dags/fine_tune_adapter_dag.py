"""
Airflow DAG to fine-tune per-user LoRA adapters when new feedback arrives
"""
from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.sensors.filesystem import FileSensor
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
    'retry_delay': timedelta(minutes=10),
}

with DAG(
    dag_id='tts_fine_tune_adapters',
    default_args=default_args,
    description='Fine-tune LoRA adapters per user on new feedback',
    schedule_interval='0 * * * *',  # hourly
    catchup=False,
) as dag:

    # Run the fine_tune_adapter script
    fine_tune_task = BashOperator(
        task_id='fine_tune_adapters',
        bash_command='python /opt/airflow/app/fine_tune_adapter.py',
    )

    fine_tune_task
