#!/usr/bin/env python3
"""
Batch job to score audio quality and backfill historical synthesis events.
"""
import os
import joblib
from app.config import Config
from app.feature_store import get_feature_store
from app.ml_monitoring import get_ml_monitor, REFERENCE_METRICS

def main():
    # Load or validate the audio quality model
    model = None
    if Config.AUDIO_QUALITY_MODEL_PATH:
        model = joblib.load(Config.AUDIO_QUALITY_MODEL_PATH)
        print(f"Loaded audio quality model from {Config.AUDIO_QUALITY_MODEL_PATH}")
    else:
        print("No AUDIO_QUALITY_MODEL_PATH set, using heuristic fallback.")

    store = get_feature_store()
    monitor = get_ml_monitor()
    events = monitor.synthesis_history

    print(f"Scoring {len(events)} historical synthesis events...")
    count = 0
    for event in events:
        timestamp = event.get('timestamp')
        request_id = timestamp  # using timestamp as unique ID
        duration_ms = event.get('duration_ms', 0)
        text_length = event.get('text_length', 0)
        model_version = event.get('metadata', {}).get('model_version', 'v1')

        # Compute quality_score
        if model:
            X = [[duration_ms, text_length]]
            try:
                quality_score = float(model.predict(X)[0])
            except Exception as e:
                print(f"Error predicting quality for event {timestamp}: {e}")
                continue
        else:
            # Heuristic: normalize duration vs reference mean_latency
            ref_ms = REFERENCE_METRICS['mean_latency'] * 1000
            ratio = min(duration_ms / ref_ms, 1.0) if ref_ms > 0 else 1.0
            quality_score = max(0.0, 1.0 - ratio)

        # Store into feature store
        try:
            store.put_quality(
                request_id=request_id,
                quality_score=quality_score,
                event_timestamp=timestamp,
                model_version=model_version
            )
            count += 1
        except Exception as e:
            print(f"Failed to store quality for {timestamp}: {e}")

    print(f"Completed backfill: {count} quality features stored.")

if __name__ == '__main__':
    main()
