# Feast feature definitions for YAP TTS Service
from datetime import timedelta
from feast import Entity, FeatureView, Feature, ValueType, FileSource

# 1. Define Entities
user = Entity(
    name="user_id",
    value_type=ValueType.STRING,
    description="Unique user identifier",
)

# 2. Define Data Sources (batch)
# Replace path with your data lake location or S3 bucket
user_feedback_source = FileSource(
    path="s3://yap-drift-samples/{date}/sample.csv",
    event_timestamp_column="event_timestamp",
)

audio_quality_source = FileSource(
    path="s3://yap-audio-quality/{date}/predictions.csv",
    event_timestamp_column="event_timestamp",
)

device_metadata_source = FileSource(
    path="s3://yap-device-metadata/{date}/metadata.csv",
    event_timestamp_column="event_timestamp",
)

# 3. Define FeatureViews
user_feedback_view = FeatureView(
    name="user_feedback",
    entities=["user_id"],
    ttl=timedelta(days=30),
    schema=[
        Feature(name="feedback_score", dtype=ValueType.DOUBLE),
    ],
    online=True,
    batch_source=user_feedback_source,
)

audio_quality_view = FeatureView(
    name="audio_quality_prediction",
    entities=[],  # no user entity, keyed by request
    ttl=timedelta(days=1),
    schema=[
        Feature(name="quality_score", dtype=ValueType.DOUBLE),
        Feature(name="model_version", dtype=ValueType.STRING),
    ],
    online=True,
    batch_source=audio_quality_source,
)

device_metadata_view = FeatureView(
    name="device_metadata",
    entities=[],
    ttl=timedelta(days=7),
    schema=[
        Feature(name="device_type", dtype=ValueType.STRING),
        Feature(name="os", dtype=ValueType.STRING),
        Feature(name="browser", dtype=ValueType.STRING),
    ],
    online=True,
    batch_source=device_metadata_source,
)

# 4. Register all in feast_repo
__all__ = [
    "user",
    "user_feedback_view",
    "audio_quality_view",
    "device_metadata_view",
]
