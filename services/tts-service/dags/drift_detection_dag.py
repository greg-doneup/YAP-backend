"""
Airflow DAG for daily drift detection and alerting
"""
from airflow import DAG
from airflow.operators.bash import BashOperator
from datetime import datetime, timedelta

# Default arguments for the DAG
default_args = {
    'owner': 'mlops',
    'depends_on_past': False,
    'start_date': datetime(2025, 5, 1),
    'email': ['ml-team@yap.ai'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=15),
}

with DAG(
    dag_id='tts_drift_detection',
    default_args=default_args,
    description='Daily drift sampler, report, and alert',
    schedule_interval='0 2 * * *',  # run at 02:00 UTC daily
    catchup=False,
) as dag:

    sample_task = BashOperator(
        task_id='sample_raw_logs',
        bash_command='python /opt/airflow/app/drift_sampler.py',
    )

    report_task = BashOperator(
        task_id='generate_drift_report',
        bash_command='python /opt/airflow/app/drift_report.py',
    )

    alert_task = BashOperator(
        task_id='check_drift_and_alert',
        bash_command='python /opt/airflow/app/drift_alert.py',
    )

    sample_task >> report_task >> alert_task
