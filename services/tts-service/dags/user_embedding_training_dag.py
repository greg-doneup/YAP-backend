"""
Airflow DAG to train user-embedding encoder daily
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
    'retry_delay': timedelta(minutes=20),
}

with DAG(
    dag_id='tts_user_embedding_training',
    default_args=default_args,
    description='Daily training of user embedding autoencoder',
    schedule_interval='0 5 * * *',  # daily at 05:00 UTC
    catchup=False,
) as dag:
    train_task = BashOperator(
        task_id='train_user_embeddings',
        bash_command='python /opt/airflow/app/train_user_embeddings.py',
    )

    train_task
