🧵 ThreadOS Simulator
Real-Time Multithreaded Application Simulator (Operating Systems Project)
📌 Overview

ThreadOS Simulator is a real-time interactive system designed to demonstrate core concepts of multithreading and concurrency in operating systems. It visualizes different thread models, scheduling algorithms, and synchronization techniques in an intuitive and educational way.

This project helps users understand how threads behave, interact, and are managed by the CPU in a multi-threaded environment.

🚀 Features
🔄 Simulation of Thread Models:
Many-to-One
One-to-Many
Many-to-Many
⚙️ CPU Scheduling Algorithms:
First Come First Serve (FCFS)
Round Robin (RR)
Priority Scheduling
🔐 Synchronization Mechanisms:
Semaphores
Monitors
📊 Visualization:
Thread state transitions
Gantt charts
Performance metrics
🎨 Interactive UI with real-time updates
🏗️ System Architecture

The simulator is divided into multiple components:

UI Controller (P1) – Handles user input and simulation control
Simulation Engine (P2) – Core logic for thread execution
Sync Engine (P3) – Manages synchronization mechanisms
Visualization Engine (P4) – Renders charts and thread states
Theme Controller (P5) – UI customization
🔍 Data Flow Diagram

The system follows a multi-level Data Flow Diagram (DFD):

Level 0: Context Diagram (User ↔ ThreadOS Simulator ↔ Browser)
Level 1: Process decomposition into major modules
Level 2: Internal working of Simulation Engine

(Refer to project report for detailed diagrams)

🧠 How It Works
User selects thread model and scheduling algorithm
Threads are created with attributes (priority, burst time, etc.)
Scheduler manages execution order
Tick processor updates thread states in real-time
Synchronization ensures safe execution
Results are visualized using charts and logs
💻 Tech Stack
Frontend: HTML, CSS, JavaScript
Backend / Logic: (Add your language here e.g. Python / Java / JS)
Visualization: Charts / Canvas / DOM
Concepts Used:
Multithreading
CPU Scheduling
Concurrency Control

🎯 Use Cases
Learning Operating System concepts
Visualizing thread scheduling
Academic projects & demonstrations
Interview preparation

📈 Future Improvements
Add more scheduling algorithms (SJF, Multilevel Queue)
Real-time performance comparison
Advanced UI animations
Distributed system simulation
Diagram Comparisons
