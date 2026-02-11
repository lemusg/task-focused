# TaskFocused
An app to help keep you focused on what's important.

# Setup Instructions

Steps to get this running on your machine:
- git clone
- git pull
- from frontend, npm install
- from backend, npm install

To connect backend server, make a `.env` file in frontend, and put in backend server (http://localhost:8000 for development)

- from the backend, `run npm run dev`
- from the frontend, `run npm run build`

Open up chrome://extensions and turn on developer mode. Select load unpacked, and select the extensions directory. Keep in mind that since extension/dist is what is being loaded, and it is built from the frontend React code. This means that when changing the frontend, to see changes you must run npm run build and reload the extension.

Keep backend server on to see changes to backend.