"use client";

import { useState } from "react";
import { Send, CheckSquare } from "lucide-react";

interface ContactFormData {
  name: string;
  email: string;
  company: string;
  message: string;
}

export function ContactForm() {
  const [form, setForm] = useState<ContactFormData>({ name: "", email: "", company: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${API_BASE}/api/v1/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Failed to send message" }));
        throw new Error(body.message || "Failed to send message");
      }
      setStatus("sent");
      setForm({ name: "", email: "", company: "", message: "" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (status === "sent") {
    return (
      <div className="card bg-base-100 border border-base-200 shadow-lg">
        <div className="card-body text-center py-12">
          <div className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center mb-4">
            <CheckSquare className="w-8 h-8 text-success" />
          </div>
          <h3 className="text-lg font-semibold">Message Sent!</h3>
          <p className="text-base-content/60 text-sm mt-2">
            Thank you for reaching out. We&apos;ll get back to you within 24 hours.
          </p>
          <button className="btn btn-ghost btn-sm mt-4" onClick={() => setStatus("idle")}>
            Send Another Message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 border border-base-200 shadow-lg">
      <div className="card-body">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text text-sm">Full Name *</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder="John Doe"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text text-sm">Email *</span>
            </label>
            <input
              type="email"
              className="input input-bordered w-full"
              placeholder="john@company.com"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text text-sm">Company</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder="Acme Inc."
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text text-sm">Message *</span>
            </label>
            <textarea
              className="textarea textarea-bordered w-full h-28"
              placeholder="Tell us how we can help..."
              required
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>
          {status === "error" && (
            <div className="alert alert-error text-sm py-2">
              <span>{errorMsg}</span>
            </div>
          )}
          <button type="submit" className="btn btn-primary w-full gap-2" disabled={status === "sending"}>
            {status === "sending" ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {status === "sending" ? "Sending..." : "Send Message"}
          </button>
        </form>
      </div>
    </div>
  );
}
