import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { WeatherForecast } from '../types';
import { readJsonResponse } from '../utils/api';
import { formatINR } from '../utils/currency';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface TravelChatbotProps {
  activeContext: {
    destination: string;
    country: string;
    budgetInr: number;
  };
  activeWeather: WeatherForecast | null;
}

const STARTER_PROMPTS = [
  'Suggest a 4-day budget-friendly Paris itinerary under ₹1,20,000 including museum passes.',
  'What indoor activities work best in Tokyo or London if heavy rain is forecast?',
  'Compare 5-day trip costs in INR for Bali vs Thailand vs Goa for two travelers.',
  'Explain permitted expedition tourism to Antarctica and estimated total cost in INR.',
];

export function TravelChatbot({ activeContext, activeWeather }: TravelChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: `Hello! I am your VoyageINR travel advisor. Ask me about any destination worldwide—from Goa and Hyderabad to Switzerland, Tokyo, Cape Town, or Antarctica—and I will estimate hotels, transport, and activities in Indian Rupees (₹) while adapting to live weather.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const nextHistory: ChatMessage[] = [...messages, { role: 'user', text: trimmed }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
          context: {
            destination: activeContext.destination,
            country: activeContext.country,
            budgetInr: activeContext.budgetInr,
            weatherSummary: activeWeather
              ? `${activeWeather.current.tempC}°C, ${activeWeather.current.condition}. ${activeWeather.advisory}`
              : undefined,
          },
        }),
      });
      const data = await readJsonResponse<{ reply?: string; error?: string }>(res);
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Could not reach AI concierge.');
      }
      setMessages([...nextHistory, { role: 'model', text: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">
            AI Travel Concierge
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Context-aware worldwide travel advisor quoting all budgets, stays, and transit estimates in INR (₹).
          </p>
        </div>
        <div className="text-xs text-slate-500">
          Active Context: {activeContext.destination}, {activeContext.country} · Budget{' '}
          <span className="font-mono-tabular font-semibold text-slate-800">
            {formatINR(activeContext.budgetInr)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Starter Questions */}
        <aside className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-display text-base font-bold text-slate-900">
            Suggested Questions
          </h2>
          <p className="text-xs text-slate-500">
            Ask anything about visas, weather swaps, INR cost breakdowns, or worldwide routes.
          </p>
          <div className="space-y-2 pt-1">
            {STARTER_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendMessage(q)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-700 hover:border-blue-700 hover:bg-blue-50/40 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </aside>

        {/* Chat Thread */}
        <section className="lg:col-span-8 rounded-xl border border-slate-200 bg-white flex flex-col h-[560px]">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Preparing personalized INR recommendation...</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="border-t border-slate-200 p-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about destinations, INR budgets, weather alternatives, or transport..."
              className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>Send</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
