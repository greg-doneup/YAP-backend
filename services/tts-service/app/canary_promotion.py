#!/usr/bin/env python3
"""
Auto-promote Canary based on Istio VirtualService and Prometheus metrics
"""
import os
import sys
import requests
from kubernetes import client, config as k8s_config
from app.config import Config

# Prometheus queries
def fetch_prometheus_value(query: str) -> float:
    resp = requests.get(f"{Config.PROMETHEUS_URL}/api/v1/query", params={'query': query})
    resp.raise_for_status()
    data = resp.json().get('data', {}).get('result', [])
    if not data:
        return 0.0
    # take first result value
    return float(data[0]['value'][1])


def evaluate():
    # Compute 95th percentile latency for canary vs stable
    latency_q = (
        'histogram_quantile(0.95, sum(rate(tts_request_duration_seconds_bucket{destination_subset="canary"}[5m])) by (le)) '
        '/ histogram_quantile(0.95, sum(rate(tts_request_duration_seconds_bucket{destination_subset="stable"}[5m])) by (le))'
    )
    error_q = (
        'sum(rate(tts_request_errors_total{destination_subset="canary"}[5m])) '
        '/ sum(rate(tts_request_errors_total{destination_subset="stable"}[5m]))'
    )
    try:
        latency_ratio = fetch_prometheus_value(latency_q)
        error_ratio   = fetch_prometheus_value(error_q)
    except Exception as e:
        print(f"Error querying Prometheus: {e}")
        sys.exit(1)

    return latency_ratio, error_ratio


def patch_weights(stable_weight: int, canary_weight: int):
    # load in-cluster or kubeconfig
    k8s_config.load_kube_config() if os.getenv('KUBECONFIG') else k8s_config.load_incluster_config()
    api = client.CustomObjectsApi()
    name = 'tts-canary'
    namespace = os.environ.get('POD_NAMESPACE', 'default')

    # patch spec.http[0].route weights
    patch = {
        'spec': {
            'http': [
                {'route': [
                    {'destination': {'host': 'tts-service', 'subset': 'stable'}, 'weight': stable_weight},
                    {'destination': {'host': 'tts-service', 'subset': 'canary'}, 'weight': canary_weight}
                ]}
            ]
        }
    }
    try:
        api.patch_namespaced_custom_object(
            group='networking.istio.io',
            version='v1beta1',
            namespace=namespace,
            plural='virtualservices',
            name=name,
            body=patch
        )
        print(f"Patched VirtualService '{name}' to stable={stable_weight}%, canary={canary_weight}%")
    except Exception as e:
        print(f"Error patching VirtualService: {e}")
        sys.exit(1)


def main():
    latency_ratio, error_ratio = evaluate()
    print(f"Latency ratio (canary/stable): {latency_ratio:.2f}")
    print(f"Error ratio   (canary/stable): {error_ratio:.2f}")

    if latency_ratio <= (1 + Config.CANARY_LATENCY_THRESHOLD) and \
       error_ratio <= (1 + Config.CANARY_ERROR_THRESHOLD):
        print("Canary meets thresholds, promoting to 100% traffic.")
        patch_weights(stable_weight=0, canary_weight=100)
    else:
        print("Canary below threshold/not safe, rolling back to 0%.")
        patch_weights(stable_weight=100, canary_weight=0)

if __name__ == '__main__':
    main()
