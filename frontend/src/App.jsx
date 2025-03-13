import { useEffect, useRef, useState } from 'react'
import './App.css'
import graphology from 'graphology'
import { Sigma } from 'sigma'

function App() {
  const containerRef = useRef(null)
  const sigmaRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [graph, setGraph] = useState(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Create a new graph
    const newGraph = new graphology.Graph();
    newGraph.addNode("1", { label: "Node 1", x: 0, y: 0, size: 10, color: "blue" });
    newGraph.addNode("2", { label: "Node 2", x: 1, y: 1, size: 10, color: "blue" });
    newGraph.addEdge("1", "2", { size: 5, color: "grey" });
    
    setGraph(newGraph)
    
    // Initialize Sigma
    sigmaRef.current = new Sigma(newGraph, containerRef.current)

    // // Set initial camera position to fit the graph
    // sigmaRef.current.getCamera().animate({ ratio: 2, x: 0, y: 0 })

    // Handle window resize
    const handleResize = () => {
      if (sigmaRef.current) {
        sigmaRef.current.refresh();
      }
    }
    window.addEventListener('resize', handleResize)

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize)
      if (sigmaRef.current) {
        sigmaRef.current.kill()
      }
    }
  }, []) // Empty dependency array means this effect runs once on mount

  // Search functionality
  useEffect(() => {
    if (!graph || !searchTerm) {
      setSearchResults([])
      return
    }

    const results = []
    graph.forEachNode((node, attributes) => {
      if (attributes.label.toLowerCase().includes(searchTerm.toLowerCase())) {
        results.push({ id: node, ...attributes })
      }
    })
    setSearchResults(results)
  }, [searchTerm, graph])

  // Handle node click in search results
  const handleNodeClick = (nodeId) => {
    if (sigmaRef.current) {
      const nodeAttributes = graph.getNodeAttributes(nodeId)
      sigmaRef.current.getCamera().animate({ 
        x: nodeAttributes.x,
        y: nodeAttributes.y,
        ratio: 0.5,
        duration: 500
      })
    }
  }

  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex',
      background: '#ffffff'
    }}>
      <div style={{
        width: '400px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        borderRight: '1px solid #e0e0e0',
        boxShadow: '4px 0 8px rgba(0, 0, 0, 0.1)',
        zIndex: 1,
        background: '#ffffff'
      }}>
        <h1 style={{ 
          margin: '0',
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#333'
        }}>
          Project ConstellAI
        </h1>

        <input
          type="text"
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #e0e0e0',
            fontSize: '14px'
          }}
        />
        <div style={{
          flex: 1,
          overflowY: 'auto'
        }}>
          {searchResults.map((node) => (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node.id)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: '4px',
                marginBottom: '4px',
                backgroundColor: '#f5f5f5',
                transition: 'background-color 0.2s ease',
                ':hover': {
                  backgroundColor: '#e0e0e0'
                }
              }}
            >
              {node.label}
            </div>
          ))}
        </div>
      </div>

      {/* Graph Container */}
      <div style={{ 
        flex: 1,
        position: 'relative'
      }}>
        <div 
          ref={containerRef} 
          style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0
          }} 
        />
      </div>
    </div>
  )
}

export default App
