# 🚀 Hosting & Deployment Guide

This guide walks you through hosting your **AI IT Helpdesk Agent** online. 

Because the backend serves the dark-glassmorphism frontend directly at `/` via FastAPI, you only need to host **a single service**!

---

## 📋 Hosting Platform Comparison

| Platform | Best For | Cost | Persistent ChromaDB | RAM / Hardware |
| :--- | :--- | :--- | :--- | :--- |
| **[Render.com](#option-1-rendercom-recommended---easiest)** | Fastest standard deploy | Free tier available | Optional Disk add-on | 512MB+ |
| **[Hugging Face Spaces](#option-2-hugging-face-spaces-100-free-high-ram)** | Heavy AI / PyTorch RAG | **100% Free** | Ephemeral or Persistent | **16 GB RAM + 2 vCPU** |
| **[Railway.app](#option-3-railwayapp)** | Fast Docker / Volume | Pay-as-you-go ($5 credit) | Yes (Volume mount) | Scalable |
| **[Self-Hosted / VPS](#option-4-docker-on-vps-digitalocean-aws-ec2-hetzner)** | Total control & privacy | $4–$6/mo | Yes | Full control |
| **[Vercel](#option-5-vercel-serverless)** | Fast static/edge | Free | `/tmp` only | 250MB limit |

---

## Option 1: Render.com (Recommended - Easiest)

Render can build and run your Python application directly from your GitHub repository.

### Step 1: Push Your Code to GitHub
```bash
git add .
git commit -m "Add responsive frontend and deployment config"
git push origin main
```

### Step 2: Deploy on Render
1. Go to **[render.com](https://render.com)** and sign in with GitHub.
2. Click **New +** → **Web Service**.
3. Select your repository (`AgenticUser`).
4. Set the following settings:
   - **Name**: `ai-it-helpdesk`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free` (or `Starter`)
5. Click **Create Web Service**.
6. Render will build the image, install dependencies, and provide a live `https://<your-app>.onrender.com` URL!

---

## Option 2: Hugging Face Spaces (100% Free High-RAM)

Hugging Face Spaces gives you a **free 16 GB RAM + 2 vCPU** machine with Docker support, which is optimal for PyTorch and local vector embeddings (`sentence-transformers` + ChromaDB).

### Steps:
1. Go to **[huggingface.co/spaces](https://huggingface.co/spaces)** and click **Create new Space**.
2. Set:
   - **Space SDK**: **Docker** (Blank)
   - **Space Hardware**: **Free (CPU Basic - 2 vCPU · 16 GB RAM)**
   - **Visibility**: Public or Private
3. Clone your new Space locally or add it as a git remote:
   ```bash
   git remote add space https://huggingface.co/spaces/<your-username>/<your-space-name>
   git push space main
   ```
4. Hugging Face will automatically detect the [Dockerfile](file:///D:/IBM/AgenticUser/Dockerfile), build the container, and launch your application with zero configuration!

---

## Option 3: Railway.app

1. Go to **[railway.app](https://railway.app)** and click **New Project** → **Deploy from GitHub repo**.
2. Select your repository. Railway will detect the `Dockerfile` automatically.
3. In **Settings** → **Networking**, click **Generate Domain** to get your public HTTPS URL.
4. (Optional) In **Variables**, add an optional persistent volume mounted to `/app/backend/data/chromadb` if you want uploaded documents to persist across rebuilds.

---

## Option 4: Docker on VPS (DigitalOcean, AWS EC2, Hetzner)

If you have your own Linux server or cloud VM with Docker installed:

```bash
# 1. Clone repository
git clone https://github.com/<your-username>/AgenticUser.git
cd AgenticUser

# 2. Build the Docker image
docker build -t it-support-agent .

# 3. Run the container with persistent storage
docker run -d \
  --name it-support-agent \
  -p 8000:8000 \
  -v $(pwd)/chroma_data:/app/backend/data/chromadb \
  --restart unless-stopped \
  it-support-agent
```
Your app will be live at `http://<your-server-ip>:8000`.

---

## Option 5: Vercel (Serverless)

The repository includes a preconfigured `vercel.json` pointing to `api/index.py`.

### Via Vercel CLI:
```bash
npm install -g vercel
vercel login
vercel --prod
```

> [!NOTE]
> Serverless platforms like Vercel have a 250 MB unzipped bundle limit. Because `sentence-transformers` and `torch` are relatively large, Render, Railway, or Hugging Face Spaces (Options 1–3) are much more resilient for continuous operation and avoid serverless cold starts.

---

## ⚙️ Environment Variables (Optional)

You don't need any API keys to run out-of-the-box because the app includes an offline deterministic heuristic troubleshooting engine and local vector embeddings.

However, if you want to connect a custom LLM backend or remote endpoint, configure these in your host's **Environment Variables** dashboard:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `OPENAI_API_KEY` | (Optional) OpenAI API Key for GPT-4o-mini | *Empty (Local Heuristic Active)* |
| `OPENAI_BASE_URL` | (Optional) Custom endpoint (e.g. cloud Ollama, vLLM) | *Official OpenAI API* |
| `OPENAI_MODEL` | Model name to invoke | `gpt-4o-mini` |
| `CONFIDENCE_THRESHOLD` | Threshold for fallback escalation | `0.3` |
| `CHROMA_PERSIST_DIR` | Directory where ChromaDB indexes are saved | `/tmp/chromadb` or `backend/data/chromadb` |
