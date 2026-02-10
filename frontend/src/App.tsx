async function pingBackend() {
  try {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ping`);
    const data = await res.json();
    alert(data.message);
  } catch {
    alert('Ping failed');
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
