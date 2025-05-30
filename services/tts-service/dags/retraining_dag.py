"""
Airflow DAG for retraining: data preparation and model training
"""
from airflow import DAG
from airflow.operators.bash import BashOperator
from datetime import datetime, timedelta

# Default args
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
    dag_id='tts_retraining_pipeline',
    default_args=default_args,
    description='Daily retraining workflow: prep data and train model',
    schedule_interval='0 3 * * *',  # daily at 03:00 UTC
    catchup=False,
) as dag:
    # Step 1: Prepare data
    prep_task = BashOperator(
        task_id='prepare_retraining_data',
        bash_command='python /opt/airflow/app/retraining.py --prepare-data',
    )

    # Step 2: Train and register
    train_task = BashOperator(
        task_id='train_and_register_model',
        bash_command='python /opt/airflow/app/retraining.py --train',
    )

    prep_task >> train_task
