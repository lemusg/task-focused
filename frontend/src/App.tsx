async function pingBackend() {
  try {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ping`);
    const data = await res.json();
    alert(data.message);
  } catch {
    alert('Ping failed');
  }
}

async function pingDb() {
  try {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ping-db`);
    const data = await res.json();
    alert(data.message);
  } catch {
    alert('Ping DB failed');
  }
}

function App() {
  return (
    <>
      <h1>Task Focused</h1>
      <div className="card">
        <button onClick={pingBackend}>
          Ping backend
        </button>
        <button onClick={pingDb} >
          Ping database
        </button>
        <p>
          Edit <code>src/App.tsx</code>
        </p>
        <p>
          run 'npm run build'
        </p>
        <p>
          reload extension to see changes
        </p>
      </div>
    </>
  )
}

export default App
