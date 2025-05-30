"""
ML Dashboard for TTS service.

This module provides a simple dashboard for ML metrics visualization.
It uses Streamlit to visualize Prometheus metrics.
"""

import os
import time
import logging
from datetime import datetime, timedelta
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
from prometheus_client.parser import text_string_to_metric_families

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import server defined metrics (in actual implementation, you might need to get these from Prometheus)
from app.ml_monitoring import (
    SYNTHESIS_REQUESTS, SYNTHESIS_LATENCY,
    MODEL_CACHE_HITS, MODEL_CACHE_MISSES,
    PROVIDER_AVAILABILITY
)

def fetch_metrics():
    """Fetch metrics from Prometheus (simplified demo version)."""
    # In a real application, you would use the Prometheus client to fetch these from the actual Prometheus server
    # This is a simplified version that works directly with metric objects
    
    # Get current values
    metrics = {
        "cache_hits": float(MODEL_CACHE_HITS._value.get()),
        "cache_misses": float(MODEL_CACHE_MISSES._value.get()),
        "provider_status": {}
    }
    
    # Get provider availability
    for metric in PROVIDER_AVAILABILITY._metrics:
        provider = metric._labelvalues[0]  # Get the provider label
        status = metric._value.get()
        metrics["provider_status"][provider] = status
    
    # Get synthesis metrics
    metrics["synthesis"] = {
        "success": float(SYNTHESIS_REQUESTS.labels(provider="azure", language="en-US", status="success")._value.get()),
        "failure": float(SYNTHESIS_REQUESTS.labels(provider="azure", language="en-US", status="failure")._value.get())
    }
    
    return metrics

def run_dashboard():
    """Run the dashboard application."""
    st.set_page_config(page_title="TTS Service ML Monitoring Dashboard", layout="wide")
    st.title("TTS Service ML Monitoring Dashboard")
    
    # Add refresh button
    if st.button("Refresh Data"):
        st.experimental_rerun()
    
    # Fetch current metrics
    metrics = fetch_metrics()
    
    # Cache metrics
    st.header("Cache Performance")
    col1, col2 = st.columns(2)
    
    with col1:
        cache_hits = metrics["cache_hits"]
        cache_misses = metrics["cache_misses"]
        total_requests = cache_hits + cache_misses
        hit_ratio = cache_hits / total_requests if total_requests > 0 else 0
        
        st.metric("Cache Hit Ratio", f"{hit_ratio:.2%}")
        st.metric("Cache Hits", int(cache_hits))
        st.metric("Cache Misses", int(cache_misses))
        
        # Create a pie chart for cache hits/misses
        fig = px.pie(
            values=[cache_hits, cache_misses],
            names=["Hits", "Misses"],
            title="Cache Hit/Miss Distribution"
        )
        st.plotly_chart(fig)
    
    # Provider availability
    with col2:
        st.subheader("Provider Status")
        
        for provider, status in metrics["provider_status"].items():
            status_text = "Available" if status else "Unavailable"
            status_color = "green" if status else "red"
            st.markdown(f"**{provider}**: <span style='color:{status_color}'>{status_text}</span>", unsafe_allow_html=True)
    
    # Synthesis metrics
    st.header("Synthesis Performance")
    col3, col4 = st.columns(2)
    
    with col3:
        success = metrics["synthesis"]["success"]
        failure = metrics["synthesis"]["failure"]
        total = success + failure
        success_rate = success / total if total > 0 else 0
        
        st.metric("Success Rate", f"{success_rate:.2%}")
        st.metric("Total Requests", int(total))
        
        # Create a gauge chart for success rate
        fig = go.Figure(go.Indicator(
            mode="gauge+number",
            value=success_rate * 100,
            domain={'x': [0, 1], 'y': [0, 1]},
            title={'text': "Success Rate"},
            gauge={
                'axis': {'range': [0, 100]},
                'bar': {'color': "darkgreen"},
                'steps': [
                    {'range': [0, 50], 'color': "red"},
                    {'range': [50, 90], 'color': "orange"},
                    {'range': [90, 100], 'color': "lightgreen"}
                ],
                'threshold': {
                    'line': {'color': "black", 'width': 4},
                    'thickness': 0.75,
                    'value': 95
                }
            }
        ))
        st.plotly_chart(fig)

    # Add historical data visualization (in a real app, you'd fetch this from a database)
    st.header("Historical Performance")
    
    # Create sample data for demonstration
    dates = pd.date_range(start=datetime.now() - timedelta(days=30), periods=30, freq='D')
    data = {
        'date': dates,
        'success_rate': [0.95 + 0.05 * (-(i-15)**2 + 225) / 225 for i in range(30)],  # Sample curve
        'latency': [0.8 + 0.2 * abs(i - 15) / 15 for i in range(30)]  # Sample curve
    }
    df = pd.DataFrame(data)
    
    # Plot historical success rate
    st.subheader("Success Rate Over Time")
    fig = px.line(df, x='date', y='success_rate', title='30 Day Success Rate Trend')
    fig.update_layout(yaxis_tickformat='.0%')
    st.plotly_chart(fig)
    
    # Plot historical latency
    st.subheader("Latency Over Time")
    fig = px.line(df, x='date', y='latency', title='30 Day Latency Trend (seconds)')
    st.plotly_chart(fig)
    
    # Footer
    st.markdown("---")
    st.markdown("**TTS Service ML Monitoring Dashboard** - Last updated: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

if __name__ == "__main__":
    run_dashboard()
