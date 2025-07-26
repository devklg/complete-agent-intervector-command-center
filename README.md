# Complete Agent Intervector Command Center

🎯 **Kevin's 17-Agent Management System**

Complete MERN stack application integrating:
- Kevin's complete_agent_command_center.html interface
- BMAD v4 backend architecture
- Docker containerization for all 17 agents
- ChromaDB coordination system

## Quick Start

```bash
git clone https://github.com/devklg/complete-agent-intervector-command-center.git
cd complete-agent-intervector-command-center
docker-compose up --build
```

**Access:** http://localhost:3000

## System Architecture

### Trinity Framework (Ports 5001-5005)
- 🎨 THEO-5001 - Frontend Specialist
- ⚙️ MARCUS-5002 - Backend Specialist  
- 📡 ALEX-5003 - Real-time Specialist
- 🧪 QUINN-5004 - QA Specialist
- 🎯 ACI-5005 - Orchestration Specialist

### PowerLine Agents (Ports 6001-6012)
- 👨‍💻 David - Database Architect
- ⚡ Elena - Backend API
- 🎨 Frank - Frontend UI
- 🧠 Grace - AI Integration
- 📡 Henry - Real-Time Systems
- 🏗️ Iris - DevOps
- 🎯 Jack - PowerLine Visualization
- 📝 Kelly - Enrollment Flow
- 📊 Liam - Dashboard Systems
- 🚀 Maya - Viral Features
- 🧪 Noah - Testing
- 📚 Olivia - Documentation

## Services

- **Frontend:** React app on port 3000
- **Backend:** Express.js API on port 5000
- **Database:** MongoDB on port 27017
- **ChromaDB:** Vector database on port 8000
- **17 Agents:** Ports 5001-5005, 6001-6012

## Features

✅ Complete agent status monitoring
✅ Real-time communication system
✅ Project management CRUD operations
✅ File upload and printing system
✅ Docker containerization
✅ ChromaDB coordination
✅ Beautiful dashboard interface
✅ Production deployment ready

## Development

**Local development without Docker:**
```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm start
```

**With Docker:**
```bash
docker-compose up --build
```

## Agent Communication

Agents communicate through ChromaDB collections:
- `agent_message_log` - Inter-agent messages
- `agent_directory` - Agent status and capabilities
- `session_restore_context` - Session persistence
- `command_center_intelligence` - System coordination

## Deployment

Production ready with:
- Multi-stage Docker builds
- Health checks
- Auto-restart policies
- Volume persistence
- Network isolation

---

**Built with Kevin's provided assets:** complete_agent_command_center.html + BMAD v4 backend structure + Docker best practices