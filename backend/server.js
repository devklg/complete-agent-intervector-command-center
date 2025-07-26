const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { ChromaClient } = require('chromadb');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Initialize ChromaDB
let chroma;
const initChroma = async () => {
  try {
    chroma = new ChromaClient({ 
      path: process.env.CHROMA_URL || 'http://localhost:8000' 
    });
    console.log('🧠 Connected to ChromaDB');
  } catch (error) {
    console.error('❌ ChromaDB connection error:', error);
  }
};

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/command-center', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('📦 Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Project Schema
const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  status: {
    type: String,
    enum: ['planning', 'active', 'on-hold', 'completed', 'cancelled'],
    default: 'planning'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  assignedAgents: [{
    agentId: String,
    agentName: String,
    role: String,
    status: String,
    assignedDate: { type: Date, default: Date.now }
  }],
  tasks: [{
    title: String,
    description: String,
    assignedAgent: String,
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'blocked'],
      default: 'pending'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    progress: { type: Number, default: 0 },
    dueDate: Date,
    completedDate: Date
  }],
  createdBy: String,
  tags: [String],
  files: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    uploadDate: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const Project = mongoose.model('Project', projectSchema);

// Agent Schema
const agentSchema = new mongoose.Schema({
  agentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['frontend', 'backend', 'fullstack', 'devops', 'qa', 'design', 'orchestration'],
    required: true
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'busy', 'error'],
    default: 'offline'
  },
  port: Number,
  endpoint: String,
  currentProject: String,
  capabilities: [String],
  lastSeen: { type: Date, default: Date.now },
  performance: {
    tasksCompleted: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 },
    successRate: { type: Number, default: 100 }
  }
}, { timestamps: true });

const Agent = mongoose.model('Agent', agentSchema);

// API Routes

// Health check
app.get('/api/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  let chromaStatus = 'disconnected';
  
  try {
    if (chroma) {
      await chroma.heartbeat();
      chromaStatus = 'connected';
    }
  } catch (error) {
    chromaStatus = 'error';
  }

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      chromadb: chromaStatus,
      socketio: 'running'
    }
  });
});

// Projects API
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const project = new Project(req.body);
    const savedProject = await project.save();
    
    // Broadcast to all connected clients
    io.emit('projectCreated', savedProject);
    
    res.status(201).json(savedProject);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Broadcast update
    io.emit('projectUpdated', project);
    
    res.json(project);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Broadcast deletion
    io.emit('projectDeleted', { id: req.params.id });
    
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Agents API
app.get('/api/agents', async (req, res) => {
  try {
    // Get agents from database
    const dbAgents = await Agent.find().sort({ agentId: 1 });
    
    // Get agent status from ChromaDB if available
    let chromaAgents = [];
    if (chroma) {
      try {
        const collection = await chroma.getOrCreateCollection({ name: 'agent_directory' });
        const results = await collection.get();
        chromaAgents = results.ids || [];
      } catch (error) {
        console.log('ChromaDB agent query error:', error.message);
      }
    }
    
    // Merge data
    const agents = dbAgents.map(agent => ({
      ...agent.toObject(),
      chromaStatus: chromaAgents.includes(agent.agentId) ? 'active' : 'inactive'
    }));
    
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const agent = new Agent(req.body);
    const savedAgent = await agent.save();
    
    // Register in ChromaDB
    if (chroma) {
      try {
        const collection = await chroma.getOrCreateCollection({ name: 'agent_directory' });
        await collection.add({
          ids: [savedAgent.agentId],
          documents: [`Agent ${savedAgent.name} - ${savedAgent.type}`],
          metadatas: [{
            agentId: savedAgent.agentId,
            name: savedAgent.name,
            type: savedAgent.type,
            status: savedAgent.status,
            timestamp: new Date().toISOString()
          }]
        });
      } catch (error) {
        console.log('ChromaDB registration error:', error.message);
      }
    }
    
    // Broadcast to all connected clients
    io.emit('agentRegistered', savedAgent);
    
    res.status(201).json(savedAgent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { ...req.body, lastSeen: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Broadcast update
    io.emit('agentUpdated', agent);
    
    res.json(agent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Agent Messages (ChromaDB Integration)
app.post('/api/agents/message', async (req, res) => {
  try {
    const { fromAgent, toAgent, message, messageType, priority } = req.body;
    
    if (!chroma) {
      return res.status(503).json({ error: 'ChromaDB not available' });
    }
    
    const collection = await chroma.getOrCreateCollection({ name: 'agent_message_log' });
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await collection.add({
      ids: [messageId],
      documents: [message],
      metadatas: [{
        fromAgent,
        toAgent,
        messageType: messageType || 'message',
        priority: priority || 'medium',
        timestamp: new Date().toISOString(),
        status: 'delivered'
      }]
    });
    
    // Broadcast message
    io.emit('newMessage', {
      id: messageId,
      fromAgent,
      toAgent,
      message,
      messageType,
      priority,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, messageId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents/messages', async (req, res) => {
  try {
    const { agentId, limit = 50 } = req.query;
    
    if (!chroma) {
      return res.status(503).json({ error: 'ChromaDB not available' });
    }
    
    const collection = await chroma.getCollection({ name: 'agent_message_log' });
    const results = await collection.query({
      queryTexts: [agentId || ''],
      nResults: parseInt(limit)
    });
    
    const messages = results.ids[0].map((id, index) => ({
      id,
      message: results.documents[0][index],
      metadata: results.metadatas[0][index]
    }));
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// System Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const totalProjects = await Project.countDocuments();
    const activeProjects = await Project.countDocuments({ status: 'active' });
    const totalAgents = await Agent.countDocuments();
    const onlineAgents = await Agent.countDocuments({ status: 'online' });
    
    let chromaCollections = 0;
    if (chroma) {
      try {
        const collections = await chroma.listCollections();
        chromaCollections = collections.length;
      } catch (error) {
        console.log('ChromaDB collections query error:', error.message);
      }
    }
    
    res.json({
      projects: {
        total: totalProjects,
        active: activeProjects
      },
      agents: {
        total: totalAgents,
        online: onlineAgents
      },
      chromadb: {
        collections: chromaCollections,
        status: chroma ? 'connected' : 'disconnected'
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('joinAgent', (agentId) => {
    socket.join(`agent_${agentId}`);
    console.log(`Agent ${agentId} joined room`);
  });
  
  socket.on('agentStatus', async (data) => {
    // Update agent status in database
    try {
      await Agent.findOneAndUpdate(
        { agentId: data.agentId },
        { 
          status: data.status,
          lastSeen: new Date(),
          ...data
        },
        { upsert: true }
      );
      
      // Broadcast status update
      socket.broadcast.emit('agentStatusUpdate', data);
    } catch (error) {
      console.error('Agent status update error:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚀 Kevin's Command Center Backend running on port ${PORT}`);
  console.log(`📊 Dashboard API: http://localhost:${PORT}/api`);
  console.log(`🧠 ChromaDB: ${process.env.CHROMA_URL || 'http://localhost:8000'}`);
  
  // Initialize ChromaDB connection
  await initChroma();
  
  // Initialize default agents if none exist
  const agentCount = await Agent.countDocuments();
  if (agentCount === 0) {
    console.log('🎯 Initializing default agents...');
    
    const defaultAgents = [
      // Trinity Framework
      { agentId: 'THEO-5001', name: 'THEO', type: 'frontend', port: 5001 },
      { agentId: 'MARCUS-5002', name: 'Marcus', type: 'backend', port: 5002 },
      { agentId: 'ALEX-5003', name: 'Alex', type: 'fullstack', port: 5003 },
      { agentId: 'QUINN-5004', name: 'Quinn', type: 'qa', port: 5004 },
      { agentId: 'ACI-5005', name: 'ACI', type: 'orchestration', port: 5005 },
      
      // PowerLine Agents
      { agentId: 'DAVID-6001', name: 'David', type: 'backend', port: 6001 },
      { agentId: 'ELENA-6002', name: 'Elena', type: 'backend', port: 6002 },
      { agentId: 'FRANK-6003', name: 'Frank', type: 'frontend', port: 6003 },
      { agentId: 'GRACE-6004', name: 'Grace', type: 'fullstack', port: 6004 },
      { agentId: 'HENRY-6005', name: 'Henry', type: 'fullstack', port: 6005 },
      { agentId: 'IRIS-6006', name: 'Iris', type: 'devops', port: 6006 },
      { agentId: 'JACK-6007', name: 'Jack', type: 'frontend', port: 6007 },
      { agentId: 'KELLY-6008', name: 'Kelly', type: 'frontend', port: 6008 },
      { agentId: 'LIAM-6009', name: 'Liam', type: 'frontend', port: 6009 },
      { agentId: 'MAYA-6010', name: 'Maya', type: 'frontend', port: 6010 },
      { agentId: 'NOAH-6011', name: 'Noah', type: 'qa', port: 6011 },
      { agentId: 'OLIVIA-6012', name: 'Olivia', type: 'design', port: 6012 }
    ];
    
    await Agent.insertMany(defaultAgents);
    console.log('✅ Default agents initialized');
  }
});

module.exports = { app, server, io };