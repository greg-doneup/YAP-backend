#!/usr/bin/env python3
"""
Retraining pipeline: data prep, training with MLflow, evaluation, and model registration
"""
import os
import io
import datetime
import argparse
import pandas as pd
import boto3
import mlflow
import mlflow.sklearn
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from app.config import Config

DATA_DIR = 'data/retrain'


def prepare_data(date_str: str = None):
    """Load raw data from object store, split train/test, save locally"""
    s3 = boto3.client('s3')
    if not date_str:
        date_str = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    prefix = f"{Config.TRAINING_DATA_PREFIX}/raw/{date_str}/"
    bucket = Config.TRAINING_DATA_BUCKET

    objs = s3.list_objects_v2(Bucket=bucket, Prefix=prefix).get('Contents', [])
    if not objs:
        print(f"No objects to prepare under {prefix}")
        return

    dfs = []
    for obj in objs:
        key = obj['Key']
        body = s3.get_object(Bucket=bucket, Key=key)['Body'].read()
        if key.lower().endswith('.csv'):
            df = pd.read_csv(io.BytesIO(body))
        else:
            df = pd.read_json(io.BytesIO(body), lines=True)
        dfs.append(df)
    full_df = pd.concat(dfs, ignore_index=True)

    # assume a 'target' column exists
    X = full_df.drop('target', axis=1)
    y = full_df['target']
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=Config.TRAIN_TEST_SPLIT, random_state=42
    )

    os.makedirs(DATA_DIR, exist_ok=True)
    X_train.to_csv(f"{DATA_DIR}/X_train.csv", index=False)
    X_test.to_csv(f"{DATA_DIR}/X_test.csv", index=False)
    y_train.to_csv(f"{DATA_DIR}/y_train.csv", index=False)
    y_test.to_csv(f"{DATA_DIR}/y_test.csv", index=False)
    print(f"Data prepared: {len(X_train)} train rows, {len(X_test)} test rows")


def train_model():
    """Train a regression model, log to MLflow & register the model"""
    # configure MLflow
    mlflow.set_tracking_uri(Config.MLFLOW_TRACKING_URI)
    mlflow.set_experiment(Config.MLFLOW_EXPERIMENT_NAME)

    # load split data
    X_train = pd.read_csv(f"{DATA_DIR}/X_train.csv")
    y_train = pd.read_csv(f"{DATA_DIR}/y_train.csv").squeeze()
    X_test  = pd.read_csv(f"{DATA_DIR}/X_test.csv")
    y_test  = pd.read_csv(f"{DATA_DIR}/y_test.csv").squeeze()

    with mlflow.start_run():
        # train a simple linear model
        model = LinearRegression()
        model.fit(X_train, y_train)

        # metrics
        train_preds = model.predict(X_train)
        test_preds  = model.predict(X_test)
        train_rmse = mean_squared_error(y_train, train_preds, squared=False)
        test_rmse  = mean_squared_error(y_test, test_preds, squared=False)

        # log params & metrics
        mlflow.log_param('model_type', 'LinearRegression')
        mlflow.log_metric('train_rmse', train_rmse)
        mlflow.log_metric('test_rmse', test_rmse)

        # register model
        mlflow.sklearn.log_model(
            sk_model=model,
            artifact_path='model',
            registered_model_name=Config.MODEL_NAME
        )

    print(f"Model trained and registered: test RMSE={test_rmse:.4f}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare-data', action='store_true')
    parser.add_argument('--train', action='store_true')
    args = parser.parse_args()
    if args.prepare_data:
        prepare_data()
    elif args.train:
        train_model()
    else:
        print("Specify --prepare-data or --train")


if __name__ == '__main__':
    main()
