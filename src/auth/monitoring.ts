/**
 * Monitoring and metrics for authentication system
 * TODO: Integrate with Prometheus or your monitoring system
 */

interface MetricCounter {
  name: string;
  help: string;
  labels: string[];
  values: Map<string, number>;
}

interface MetricHistogram {
  name: string;
  help: string;
  values: number[];
}

class SimpleMetrics {
  private counters: Map<string, MetricCounter> = new Map();
  private histograms: Map<string, MetricHistogram> = new Map();

  createCounter(name: string, help: string, labels: string[] = []): void {
    this.counters.set(name, {
      name,
      help,
      labels,
      values: new Map(),
    });
  }

  createHistogram(name: string, help: string): void {
    this.histograms.set(name, {
      name,
      help,
      values: [],
    });
  }

  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const counter = this.counters.get(name);
    if (!counter) return;

    const key = Object.values(labels).join(":");
    const current = counter.values.get(key) || 0;
    counter.values.set(key, current + 1);
  }

  observeHistogram(name: string, value: number): void {
    const histogram = this.histograms.get(name);
    if (!histogram) return;

    histogram.values.push(value);
    // Keep last 1000 values
    if (histogram.values.length > 1000) {
      histogram.values.shift();
    }
  }

  getMetrics(): string {
    let output = "";

    // Output counters
    for (const [name, counter] of this.counters) {
      output += `# HELP ${name} ${counter.help}\n`;
      output += `# TYPE ${name} counter\n`;
      for (const [labels, value] of counter.values) {
        output += `${name}{${labels}} ${value}\n`;
      }
      output += "\n";
    }

    // Output histograms
    for (const [name, histogram] of this.histograms) {
      output += `# HELP ${name} ${histogram.help}\n`;
      output += `# TYPE ${name} histogram\n`;
      const sum = histogram.values.reduce((a, b) => a + b, 0);
      const count = histogram.values.length;
      output += `${name}_sum ${sum}\n`;
      output += `${name}_count ${count}\n`;
      output += "\n";
    }

    return output;
  }
}

const metrics = new SimpleMetrics();

// Initialize metrics
metrics.createCounter("auth_registrations_total", "Total registrations", ["method"]);
metrics.createCounter("auth_logins_total", "Total logins", ["method", "status"]);
metrics.createCounter("auth_failed_logins_total", "Failed login attempts", ["reason"]);
metrics.createCounter("auth_password_resets_total", "Password reset requests");
metrics.createCounter("auth_sessions_created_total", "Sessions created");
metrics.createCounter("auth_sessions_revoked_total", "Sessions revoked", ["reason"]);
metrics.createHistogram("auth_login_duration_seconds", "Login duration");

export const authMetrics = {
  registrations: {
    inc: (method: string) => {
      metrics.incrementCounter("auth_registrations_total", { method });
    },
  },

  logins: {
    inc: (method: string, status: string) => {
      metrics.incrementCounter("auth_logins_total", { method, status });
    },
  },

  loginDuration: {
    observe: (duration: number) => {
      metrics.observeHistogram("auth_login_duration_seconds", duration);
    },
  },

  failedLogins: {
    inc: (reason: string) => {
      metrics.incrementCounter("auth_failed_logins_total", { reason });
    },
  },

  passwordResets: {
    inc: () => {
      metrics.incrementCounter("auth_password_resets_total");
    },
  },

  sessionCreated: {
    inc: () => {
      metrics.incrementCounter("auth_sessions_created_total");
    },
  },

  sessionRevoked: {
    inc: (reason: string) => {
      metrics.incrementCounter("auth_sessions_revoked_total", { reason });
    },
  },

  getMetrics: () => {
    return metrics.getMetrics();
  },
};

// Alert conditions (for documentation):
// - failed_logins_total > 100 per 5 minutes from same IP -> potential brute force
// - password_resets_total > 50 per hour -> potential enumeration attack
// - registrations_total spike -> potential bot attack
