# Discord Export App

A comprehensive desktop application built with Electron, React, and Vite that allows users to export, view, and analyze their Discord chat history in a beautiful, user-friendly interface. 

<img width="1377" height="840" alt="Screenshot 2026-03-05 at 10 36 29 AM" src="https://github.com/user-attachments/assets/4ac7f39c-062b-4b49-9fa6-c1fd449d415e" />

## Features

- **Chat Exporting:** Export entire Discord server histories, direct messages, and group chats into a readable format.
- **Export Options:** Choose between exporting chat history as HTML for easy viewing or raw JSON for complete data.
- **Advanced Filtering:** Filter chat exports by specific date ranges.
- **Moderator Analytics:** Gain insights into your community with moderator engagement metrics, average response times, and a User Spotlight view.
- **AI-Powered Insights:** Features a "Gather Insight" tool that analyzes conversations and provides useful overviews, summaries, and action items.
- **Modern UI:** Built with an aesthetically pleasing, responsive interface featuring interactive particle backgrounds, neat animations, and well-designed components.

## Prerequisites

Before running this project, you will need the following installed:
- [Node.js](https://nodejs.org/en) (v16 or higher recommended)
- Git

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ChristopherDownie/Discord-Export-App.git
   cd "Discord-Export-App"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   *(Note: This project uses standard npm but is compatible with yarn/pnpm)*

## Running the Application

### Development Mode

To run the application in development mode with Hot Module Replacement (HMR):

```bash
npm run dev
```
This will start the Vite development server and launch the Electron application locally. 

### Building for Production

To build an executable version of the app for your operating system:

**For macOS (ARM64 / Apple Silicon):**
```bash
npm run build:mac
```
*This command uses electron-builder to output a finished `.app` and a `.dmg` installer file in the `release/` directory.*

**Standard Build command (compiles code but does not package):**
```bash
npm run build
```
<img width="1393" height="698" alt="Screenshot 2026-03-05 at 10 36 39 AM" src="https://github.com/user-attachments/assets/f44ab4cc-6fc0-4f48-818b-fb09dd9e108f" />

## Technologies Used

- [Electron](https://www.electronjs.org/) - Desktop application framework
- [React](https://react.dev/) - UI Library
- [Vite](https://vitejs.dev/) - Fast build tool and development server
- [TypeScript](https://www.typescriptlang.org/) - Static typing for JavaScript
- Vanilla CSS - Custom, lightweight styling for a modern UI

  

## License

This project is licensed under the MIT License.
