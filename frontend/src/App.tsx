import './App.css'

function App() {

  return (
    <>
      <h1>Task Focused</h1>
      <div className="card">
        <button onClick={() => {alert("You clicked button")}}>
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
