export interface UsageEvent {
    service: string;            // e.g. voice-score
    wallet:  string;            // learner wallet
    cost:    number;            // micro-USD
    ts:      string;            // ISO timestamp
  }
  