import { useEffect, useRef, useState } from 'react'
import './App.css'
import graphology from 'graphology'
import { Sigma } from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'

function App() {
  const containerRef = useRef(null)
  const sigmaRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [graph, setGraph] = useState(null)

  const fetchTwitterUsers = async () => {
    try {
      const response = await fetch('http://localhost:8000/twitter/users')
      const users = await response.json()
      return users
    } catch (error) {
      console.error('Error fetching Twitter users:', error)
      return { user: [], followers: [] }
    }
  }

  const fetchTwitterEdges = async () => {
    try {
      const response = await fetch('http://localhost:8000/twitter/edges')
      const edges = await response.json()
      console.log(edges.user1.length)
      return edges
    } catch (error) {
      console.error('Error fetching Twitter edges:', error)
      return { user1: [], user2: [] }
    }
  }

  useEffect(() => {
    if (!containerRef.current) return

    const initializeGraph = async () => {
      // Create a new graph
      const newGraph = new graphology.Graph()
      
      // Fetch Twitter users and edges
      const [users, edges] = await Promise.all([
        fetchTwitterUsers(),
        fetchTwitterEdges()
      ])
      
      // First add all nodes with random initial positions
      const maxFollowers = Math.max(...users.followers)
      const minLogFollowers = Math.log(Math.min(...users.followers.filter(f => f > 0)) || 1)
      const maxLogFollowers = Math.log(maxFollowers)
      
      users.user.forEach((username, index) => {
        const followers = users.followers[index]
        // Calculate normalized log size between 5 and 25 based on followers
        const logFollowers = followers > 0 ? Math.log(followers) : minLogFollowers
        const normalizedSize = 4 + ((logFollowers - minLogFollowers) / (maxLogFollowers - minLogFollowers)) * 12

        newGraph.addNode(username, {
          label: username,
          x: Math.random() * 10 - 5,  // Random position between -5 and 5
          y: Math.random() * 10 - 5,
          size: normalizedSize,
          color: "#1DA1F2" // Twitter blue color
        })
      })

      // Add edges between users
      edges.user1.forEach((user1, index) => {
        const user2 = edges.user2[index]
        if (newGraph.hasNode(user1) && newGraph.hasNode(user2)) {
          newGraph.addEdge(user1, user2, {
            size: 1,
            color: "#657786" // Twitter gray color
          })
        }
      })

      // Run ForceAtlas2 layout
      const settings = {
        iterations: 300,  // More iterations for better settling
        settings: {
          gravity: 0.1,   // Reduced gravity to allow more spread
          // linLogMode: true,
          strongGravityMode: true,  // Helps prevent disconnected components from drifting too far
          scalingRatio: 20,  // Increased to create more space between nodes
          // slowDown: 10,     // Increased for more stable layout
          preventOverlap: true,  // Stops nodes from overlapping
          barnesHutOptimize: true  // Better performance for large graphs
        }
      }
      
      forceAtlas2.assign(newGraph, settings)
      
      setGraph(newGraph)
      
      // Initialize Sigma
      if (sigmaRef.current) {
        sigmaRef.current.kill()
      }
      
      sigmaRef.current = new Sigma(newGraph, containerRef.current, {
        renderParams: {
          contextSize: 2048,
          canvasSize: 2048
        }
      })
      
      // Set initial camera position to fit the graph
      const camera = sigmaRef.current.getCamera()
      camera.setState({x: 0, y: 0, ratio: 2})
      sigmaRef.current.refresh()
    }

    initializeGraph()

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
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#f8f9fa'  // Light grey background
      }}>
        <div 
          ref={containerRef} 
          style={{ 
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0
          }} 
        />
      </div>
    </div>
  )
}

export default App
