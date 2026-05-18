const config = require('./config');

const rollingWindow = [];
let isAnalyzing = false;

async function analyzeWithAI(broadcastAlert) {
  if (rollingWindow.length === 0 || isAnalyzing) return;
  
  if (!config.geminiKey) {
    console.log('[AI Anomaly] GEMINI_API_KEY not set. Skipping real analysis.');
    
    // Fallback Mock Logic: If 5 events happen within a tiny window, flag it.
    if (rollingWindow.length >= 5) {
      broadcastAlert({ 
        type: 'ANOMALY_ALERT', 
        message: 'High-velocity order anomalies detected! (Mock AI Analysis - Add API Key for real insights)' 
      });
      rollingWindow.length = 0;
    }
    return;
  }

  isAnalyzing = true;
  const eventsToAnalyze = [...rollingWindow];
  rollingWindow.length = 0; // Clear window

  try {
    const prompt = `You are a real-time fraud detection AI. Analyze the following e-commerce database events.
Look for suspicious patterns: 
1. Multiple orders placed rapidly by the same customer.
2. Sudden spikes in volume.
3. Impossible status reversals.

If there is an anomaly, reply with exactly this JSON format: {"anomaly": true, "reason": "Short explanation"}
If normal, reply with exactly: {"anomaly": false}

Events: ${JSON.stringify(eventsToAnalyze)}`;
    
    // Using Node 20's native fetch with Google Gemini REST API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const text = data.candidates[0].content.parts[0].text;
      const match = text.match(/\{.*\}/s);
      if (match) {
        const result = JSON.parse(match[0]);
        if (result.anomaly) {
          console.warn('\x1b[31m[AI Anomaly Detected]\x1b[0m', result.reason);
          broadcastAlert({ type: 'ANOMALY_ALERT', message: result.reason });
        } else {
          console.log('[AI Anomaly] Stream analysis clean.');
        }
      }
    }
  } catch (err) {
    console.error('[AI Anomaly] Failed to communicate with Gemini API:', err.message);
  } finally {
    isAnalyzing = false;
  }
}

function recordEventForAI(event, broadcastAlert) {
  rollingWindow.push(event);
  
  // Trigger analysis if we accumulate 5 events (to simulate quick velocity check)
  if (rollingWindow.length >= 5) {
    analyzeWithAI(broadcastAlert);
  }
}

async function generateOrderSummary(order) {
  if (!config.geminiKey) return `Order #${order.id} for ${order.product_name} is now ${order.status}.`; // Graceful Fallback

  try {
    const prompt = `Write a single, friendly sentence summarizing this e-commerce order update. Customer: ${order.customer_name}, Product: ${order.product_name}, Status: ${order.status}. Make it professional but warm. Return ONLY the sentence.`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
      })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text.trim();
    }
  } catch (err) {
    console.error('[AI Summary] Error generating summary:', err.message);
  }
  
  return `Order #${order.id} for ${order.product_name} is now ${order.status}.`;
}

module.exports = { recordEventForAI, generateOrderSummary };
