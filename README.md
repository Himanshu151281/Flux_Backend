# Dark Pizza Forge - Secure File Sharing

A secure file sharing application built with React, Vite, and Express.

## Features

- Upload and share files via a secure backend
- Real-time notifications with Socket.io
- Modern UI with ShadCN components
- File progress tracking
- Shareable links for easy file access

## Setup Instructions

### Prerequisites

- Node.js 16.x or higher
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/dark-pizza-forge.git
cd dark-pizza-forge
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file in the root directory with:
```
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

### Running the Application

#### Development mode

1. Start the backend server:
```bash
npm run server:dev
```

2. In another terminal, start the frontend:
```bash
npm run dev
```

3. Or run both concurrently:
```bash
npm run dev:full
```

4. Access the application at http://localhost:8080

#### Production mode

1. Build the frontend:
```bash
npm run build
```

2. Build the server:
```bash
npm run build:server
```

3. Start the production server:
```bash
npm start
```

## How It Works

1. **Upload a file**: Select or drag-and-drop a file to upload
2. **Share the link**: Copy the generated link to share with others
3. **Receive files**: Others can access your file through the shared link

## Technologies Used

- React with TypeScript
- Vite for frontend building
- Express.js backend
- Socket.io for real-time communication
- ShadCN UI components
- TailwindCSS for styling

## License

MIT
