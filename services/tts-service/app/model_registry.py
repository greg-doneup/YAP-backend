"""
Model Registry utilities using MLflow Model Registry.
"""
import os
import mlflow
from mlflow.tracking import MlflowClient
from mlflow.entities.model_registry import Stage

class ModelRegistry:
    """Utility class for interacting with MLflow Model Registry."""

    def __init__(self, tracking_uri: str = None):
        """
        Initialize the ModelRegistry.
        Args:
            tracking_uri: MLflow tracking URI; falls back to MLFLOW_TRACKING_URI env var or default
        """
        if tracking_uri:
            mlflow.set_tracking_uri(tracking_uri)
        self.client = MlflowClient()

    def get_latest_model(self, name: str, stage: str = Stage.PRODUCTION) -> str:
        """
        Get the local path to the latest model in the specified stage.
        Args:
            name: Registered model name
            stage: Model stage (e.g., "Production", "Staging")
        Returns:
            Local filesystem path to the model artifact
        """
        # Retrieve latest versions
        versions = self.client.get_latest_versions(name, stages=[stage])
        if not versions:
            raise ValueError(f"No versions found for model '{name}' in stage '{stage}'")
        version = versions[0]
        # Download artifacts for the model version
        run_id = version.run_id
        artifact_path = version.source  # where artifact is stored
        # mlflow.artifacts.download_artifacts requires model URI
        model_uri = f"runs:/{run_id}/{version.tags.get('mlflow.runName', 'model')}"
        local_path = mlflow.artifacts.download_artifacts(artifact_uri=model_uri)
        return local_path

    def register_model(self, artifact_path: str, name: str, description: str = None) -> None:
        """
        Register a new model version in the MLflow Model Registry.
        Args:
            artifact_path: URI or local path to model artifacts
            name: Registered model name
            description: Optional description for the model
        """
        # Ensure registered model exists
        try:
            self.client.get_registered_model(name)
        except mlflow.exceptions.RestException:
            self.client.create_registered_model(name)
        # Create a new version
        mv = self.client.create_model_version(name=name, source=artifact_path, run_id=None)
        if description:
            self.client.update_model_version(name, mv.version, description=description)
        # Optionally transition to staging
        # self.client.transition_model_version_stage(name, mv.version, Stage.STAGING)

    def transition_stage(self, name: str, version: int, stage: str) -> None:
        """
        Transition a model version to a new stage.
        Args:
            name: Registered model name
            version: Model version number
            stage: New stage name
        """
        self.client.transition_model_version_stage(name, version, stage)
