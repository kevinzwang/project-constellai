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
  const [fullGraph, setFullGraph] = useState(null)
  const [selectedNodes, setSelectedNodes] = useState(new Set())

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

  // Toggle node selection
  const toggleNodeSelection = (nodeId) => {
    const newSelectedNodes = new Set(selectedNodes)
    
    if (newSelectedNodes.has(nodeId)) {
      // If already selected, deselect it
      newSelectedNodes.delete(nodeId)
    } else {
      // Otherwise, add it to selections
      newSelectedNodes.add(nodeId)
    }
    
    setSelectedNodes(newSelectedNodes)
  }

  // Apply force atlas 2 layout to graph
  const applyForceAtlas2 = (graphData) => {
    const settings = {
      iterations: 100,  // Reduced iterations for faster updates
      settings: {
        gravity: 0.1,
        strongGravityMode: true,
        scalingRatio: 20,
        preventOverlap: true,
        barnesHutOptimize: true
      }
    }
    
    forceAtlas2.assign(graphData, settings)
    return graphData
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

      // Apply initial force atlas layout
      applyForceAtlas2(newGraph)
      
      // Store the full graph data for reference
      setFullGraph(newGraph.copy())
      setGraph(newGraph)
      
      // Initialize Sigma
      initializeSigma(newGraph)
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

  // Initialize or reinitialize Sigma
  const initializeSigma = (graphData) => {
    if (sigmaRef.current) {
      sigmaRef.current.kill()
    }
    
    sigmaRef.current = new Sigma(graphData, containerRef.current, {
      renderParams: {
        contextSize: 2048,
        canvasSize: 2048
      }
    })
    
    // Set camera position to fit the graph
    const camera = sigmaRef.current.getCamera()
    camera.setState({x: 0, y: 0, ratio: 2})
    
    // Add click event for nodes
    sigmaRef.current.on('clickNode', ({ node }) => {
      toggleNodeSelection(node)
    })
    
    sigmaRef.current.refresh()
  }

  // Search functionality
  useEffect(() => {
    if (!fullGraph || !searchTerm) {
      setSearchResults([])
      return
    }

    const results = []
    fullGraph.forEachNode((node, attributes) => {
      if (attributes.label.toLowerCase().includes(searchTerm.toLowerCase())) {
        results.push({ id: node, ...attributes })
      }
    })
    setSearchResults(results)
  }, [searchTerm, fullGraph])

  // Get connected nodes for a given node
  const getConnectedNodes = (nodeId) => {
    const connectedNodes = new Set([nodeId])
    
    fullGraph.forEachEdge((edge, attributes, source, target) => {
      if (source === nodeId) {
        connectedNodes.add(target)
      } else if (target === nodeId) {
        connectedNodes.add(source)
      }
    })
    
    return connectedNodes
  }
  
  // Update the graph based on selected nodes
  const updateGraph = () => {
    if (!fullGraph) return
    
    // Create a new filtered graph
    const filteredGraph = new graphology.Graph()
    
    // If no nodes are selected, show the full graph
    if (selectedNodes.size === 0) {
      fullGraph.forEachNode((node, attributes) => {
        // Copy node but with initial random positions for layout
        filteredGraph.addNode(node, { 
          ...attributes,
          x: Math.random() * 10 - 5,  // Random initial position
          y: Math.random() * 10 - 5
        })
      })
      
      fullGraph.forEachEdge((edge, attributes, source, target) => {
        filteredGraph.addEdge(source, target, { ...attributes })
      })
    } else {
      // Get all nodes that should be displayed (selected nodes and their connections)
      const nodesToShow = new Set()
      
      // Add all selected nodes
      selectedNodes.forEach(nodeId => {
        // Get connected nodes for this node
        const connectedSet = getConnectedNodes(nodeId)
        connectedSet.forEach(id => nodesToShow.add(id))
      })
      
      // Add the nodes to the filtered graph
      nodesToShow.forEach(nodeId => {
        if (fullGraph.hasNode(nodeId)) {
          const attrs = fullGraph.getNodeAttributes(nodeId)
          // Highlight selected nodes
          const isSelected = selectedNodes.has(nodeId)
          filteredGraph.addNode(nodeId, { 
            ...attrs, 
            color: isSelected ? "#FF3366" : attrs.color, // Highlight selected nodes
            // size: isSelected ? attrs.size * 1.5 : attrs.size, // Make selected nodes larger
            // x: Math.random() * 10 - 5,  // Random initial position for layout
            // y: Math.random() * 10 - 5
          })
        }
      })
      
      // Add edges between nodes that should be shown
      fullGraph.forEachEdge((edge, attributes, source, target) => {
        if (nodesToShow.has(source) && nodesToShow.has(target)) {
          filteredGraph.addEdge(source, target, { ...attributes })
        }
      })
    }
    
    // Apply Force Atlas 2 to the filtered graph to recalculate layout
    applyForceAtlas2(filteredGraph)
    
    // Update the graph state
    setGraph(filteredGraph)
    
    // Update Sigma instance with the new graph data
    initializeSigma(filteredGraph)
  }
  
  // Handle node click from search results
  const handleNodeClick = (nodeId) => {
    toggleNodeSelection(nodeId)
    
    // Clear search term after selection
    setSearchTerm('')
  }

  // Effect to update graph when selected nodes change
  useEffect(() => {
    if (fullGraph) {
      updateGraph()
    }
  }, [selectedNodes, fullGraph])

  // Clear selection button handler
  const handleClearSelection = () => {
    setSelectedNodes(new Set())
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
          ConstellAI
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
        
        {/* Selected nodes section */}
        {selectedNodes.size > 0 && (
          <div style={{
            marginTop: '8px',
            padding: '12px',
            backgroundColor: '#f5f8fa',
            borderRadius: '4px',
            border: '1px solid #e1e8ed'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Selected Nodes ({selectedNodes.size})</h3>
              <button 
                onClick={handleClearSelection}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#e1e8ed',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Clear All
              </button>
            </div>
            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {Array.from(selectedNodes).map(nodeId => (
                <div 
                  key={nodeId}
                  onClick={() => toggleNodeSelection(nodeId)}
                  style={{
                    padding: '4px 8px',
                    margin: '2px 0',
                    backgroundColor: '#FF3366',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>{nodeId}</span>
                  <span>×</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Search results */}
        <div style={{
          flex: 1,
          overflowY: 'auto'
        }}>
          {searchResults.length > 0 && (
            <div style={{ marginBottom: '8px', fontSize: '14px', color: '#657786' }}>
              {searchResults.length} results found
            </div>
          )}
          {searchResults.map((node) => (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node.id)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: '4px',
                marginBottom: '4px',
                backgroundColor: selectedNodes.has(node.id) ? '#e8f5fd' : '#f5f5f5',
                borderLeft: selectedNodes.has(node.id) ? '3px solid #1DA1F2' : 'none',
                transition: 'background-color 0.2s ease'
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