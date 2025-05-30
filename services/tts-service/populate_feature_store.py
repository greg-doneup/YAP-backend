"""
Script to populate Redis feature store from historical MLMonitor data.
"""
import json
from app.ml_monitoring import get_ml_monitor
from app.feature_store import get_feature_store


def main():
    monitor = get_ml_monitor()
    store = get_feature_store()

    print("Populating feature store from historical synthesis events...")
    for idx, event in enumerate(monitor.synthesis_history):
        timestamp = event.get('timestamp')
        language = event.get('language')
        text_length = event.get('text_length')
        provider = event.get('provider')
        success = event.get('success')

        # Generate a unique Redis key for this event
        key = f"feature:{timestamp}"

        features = {
            'text_length': text_length,
            'language': language,
            'provider': provider,
            'success': success
        }

        try:
            store.put_features(key, features)
            print(f"Stored features for {key}")
        except Exception as e:
            print(f"Error storing features for {key}: {e}")

    print("Feature store population complete.")

if __name__ == '__main__':
    main()
