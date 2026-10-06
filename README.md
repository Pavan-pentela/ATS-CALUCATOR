# AI Resume Screener 🤖

A simple, AI-powered resume screening tool built with **React + Tailwind CSS** and **Gemini 2.5 Flash**.

Upload a PDF resume, paste a job description, and get an instant AI match analysis.

---

## 📁 Project Structure

```
resume-screening/
├── frontend/          ← React + Vite + Tailwind CSS app
│   ├── src/
│   │   ├── App.jsx
│   │   ├── UploadForm.jsx
│   │   ├── Result.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── n8n/
│   └── workflow.json  ← Import this into n8n
└── README.md
```

---

## 🚀 Getting Started

### 1. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:1727

### 2. Configure an Analysis Provider

The app requires a real analysis provider and will not present keyword-only demo output as an AI report.

1. Copy `frontend/.env.example` to `frontend/.env.local`.
2. Set either `VITE_N8N_WEBHOOK_URL` to an active n8n webhook, or `VITE_GEMINI_API_KEY` to a valid Gemini API key.
3. Restart the frontend dev server.

The n8n webhook is recommended for deployed use because `VITE_` variables are included in browser code. Without a configured provider, the app shows a warning and does not generate a report.

---

## 🔑 Getting a Gemini API Key (Free)

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with Google
3. Create a new key
4. Store it in `frontend/.env.local` and restart the frontend. Direct Gemini mode exposes `VITE_` values in browser code; use n8n for production deployments.

---

## ⚙️ n8n Workflow Setup

1. Open your n8n instance
2. Click **Import** → select `n8n/workflow.json`
3. Set your **Google Gemini API credential** inside the Gemini node
4. **Activate** the workflow
5. Copy the webhook URL (looks like `https://your-n8n.com/webhook/resume-screen`)
6. Set the webhook URL in `frontend/.env.local` and restart the frontend.

### Workflow Flow
```
Webhook → Gemini AI → Parse JSON → Respond to Webhook
```

The webhook accepts:
```json
{
  "resumeText": "...",
  "jobDescription": "..."
}
```

---

## 📊 What the Results Show

| Field | Description |
|-------|-------------|
| Candidate Name | Extracted from resume |
| Overall Score | Calculated from job-skill coverage (80%) and experience fit (20%) |
| Experience | Professional experience stated in the resume |
| Matched Skills | Job requirements with evidence in the resume |
| Missing Skills | Job requirements not evidenced in the resume |
| Recommendation | Shortlist, consider an internship, or develop skills |
| Summary | AI assessment grounded in the resume and job description |

---

## 🛠️ Tech Stack

| Part | Technology |
|------|-----------|
| Frontend | React 19 + Vite |
| Styling | Tailwind CSS v4 |
| AI | Gemini 2.5 Flash |
| Backend | n8n (optional) |
| Storage | None (localStorage optional) |
