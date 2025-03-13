import { useEffect, useRef, useState } from 'react'
import './App.css'
import graphology from 'graphology'
import { Sigma } from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { marked } from 'marked';

function App() {
  const containerRef = useRef(null)
  const sigmaRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [graph, setGraph] = useState(null)
  const [fullGraph, setFullGraph] = useState(null)
  const [selectedNodes, setSelectedNodes] = useState(new Set())
  const [analyzeResponse, setAnalyzeResponse] = useState('')  // API response text
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

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
      newSelectedNodes.delete(nodeId)
    } else {
      newSelectedNodes.add(nodeId)
    }
    
    setSelectedNodes(newSelectedNodes)
  }

  const analyzeNodes = async () => {
    if (selectedNodes.size < 2) return;
  
    try {
      setAnalyzeLoading(true);
  
      const response = await fetch('http://localhost:8000/twitter/connections/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: Array.from(selectedNodes) })
      });
  
      let text = await response.text();
      text = text.trim();
      if (
        (text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))
      ) {
        text = text.substring(1, text.length - 1);
      }
      text = text
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n');
  
      const html = marked(text);
  
      setAnalyzeResponse(html);
    } catch (error) {
      console.error('Error analyzing nodes:', error);
    } finally {
      setAnalyzeLoading(false);
    }
  };  

  // Apply force atlas 2 layout to graph
  const applyForceAtlas2 = (graphData) => {
    const settings = {
      iterations: 100,
      settings: {
        gravity: 0.1,
        strongGravityMode: true,
        scalingRatio: 1,
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
      const newGraph = new graphology.Graph()
      
      const [users, edges] = await Promise.all([
        fetchTwitterUsers(),
        fetchTwitterEdges()
      ])
      
      const maxFollowers = Math.max(...users.followers)
      const minLogFollowers = Math.log(Math.min(...users.followers.filter(f => f > 0)) || 1)
      const maxLogFollowers = Math.log(maxFollowers)
      
      users.user.forEach((username, index) => {
        const followers = users.followers[index]
        const logFollowers = followers > 0 ? Math.log(followers) : minLogFollowers
        const normalizedSize = 4 + ((logFollowers - minLogFollowers) / (maxLogFollowers - minLogFollowers)) * 12

        newGraph.addNode(username, {
          label: username,
          x: Math.random() * 10 - 5,
          y: Math.random() * 10 - 5,
          size: normalizedSize,
          color: "#1DA1F2"
        })
      })

      edges.user1.forEach((user1, index) => {
        const user2 = edges.user2[index]
        if (newGraph.hasNode(user1) && newGraph.hasNode(user2)) {
          newGraph.addEdge(user1, user2, {
            size: 1,
            color: "#657786"
          })
        }
      })

      applyForceAtlas2(newGraph)
      
      setFullGraph(newGraph.copy())
      setGraph(newGraph)
      
      initializeSigma(newGraph)
    }

    initializeGraph()

    const handleResize = () => {
      if (sigmaRef.current) {
        sigmaRef.current.refresh();
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (sigmaRef.current) {
        sigmaRef.current.kill()
      }
    }
  }, [])

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
    
    const camera = sigmaRef.current.getCamera()
    camera.setState({x: 0, y: 0, ratio: 2})
    
    sigmaRef.current.on('clickNode', ({ node }) => {
      toggleNodeSelection(node)
    })
    
    sigmaRef.current.refresh()
  }

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
  
  const updateGraph = () => {
    if (!fullGraph) return
    
    const filteredGraph = new graphology.Graph()
    
    if (selectedNodes.size === 0) {
      fullGraph.forEachNode((node, attributes) => {
        filteredGraph.addNode(node, { 
          ...attributes,
          x: Math.random() * 10 - 5,
          y: Math.random() * 10 - 5
        })
      })
      
      fullGraph.forEachEdge((edge, attributes, source, target) => {
        filteredGraph.addEdge(source, target, { ...attributes })
      })
    } else {
      const nodesToShow = new Set()
      
      selectedNodes.forEach(nodeId => {
        const connectedSet = getConnectedNodes(nodeId)
        connectedSet.forEach(id => nodesToShow.add(id))
      })
      
      nodesToShow.forEach(nodeId => {
        if (fullGraph.hasNode(nodeId)) {
          const attrs = fullGraph.getNodeAttributes(nodeId)
          const isSelected = selectedNodes.has(nodeId)
          filteredGraph.addNode(nodeId, { 
            ...attrs, 
            color: isSelected ? "#FF3366" : attrs.color,
          })
        }
      })
      
      fullGraph.forEachEdge((edge, attributes, source, target) => {
        if (nodesToShow.has(source) && nodesToShow.has(target)) {
          filteredGraph.addEdge(source, target, { ...attributes })
        }
      })
    }
    
    applyForceAtlas2(filteredGraph)
    
    setGraph(filteredGraph)
    
    initializeSigma(filteredGraph)
  }
  
  const handleNodeClick = (nodeId) => {
    toggleNodeSelection(nodeId)
    setSearchTerm('')
  }

  useEffect(() => {
    if (fullGraph) {
      updateGraph()
    }
  }, [selectedNodes, fullGraph])

  // Modified: Clear only the selected nodes, leaving analysis text intact.
  const handleClearSelection = () => {
    setSelectedNodes(new Set())
  }

  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      backgroundColor: '#ffffff'
    }}>
      <div style={{
        width: '400px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        borderRight: '1.5px solid #E1E8ED',
        backgroundColor: '#ffffff'
      }}>
        <h1 style={{ 
          margin: '0',
          fontSize: '22px',
          fontWeight: 'bold',
          color: '#14171A'
        }}>
          ConstellAI
        </h1>

        <input
          type="text"
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '10px 15px',
            borderRadius: '9999px',
            border: '1px solid #E1E8ED',
            backgroundColor: '#F5F8FA',
            fontSize: '15px'
          }}
        />
        
        {/* Selected nodes section */}
        {selectedNodes.size > 0 && (
          <div style={{
            marginTop: '8px',
            padding: '12px',
            backgroundColor: '#F5F8FA',
            borderRadius: '8px',
            border: '1px solid #E1E8ED'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#14171A' }}>Selected Nodes ({selectedNodes.size})</h3>
              <button 
                onClick={handleClearSelection}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#E1E8ED',
                  border: 'none',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  fontSize: '13px'
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
                    padding: '6px 10px',
                    margin: '4px 0',
                    backgroundColor: '#1DA1F2',
                    color: 'white',
                    borderRadius: '9999px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>{nodeId}</span>
                  <span>×</span>
                </div>
              ))}
            </div>
            {selectedNodes.size >= 2 && (
              <button 
                onClick={analyzeNodes}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#14171A',
                  color: 'white',
                  border: 'none',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  marginTop: '12px',
                  fontWeight: 'bold',
                  fontSize: '15px'
                }}
              >
                Analyze
              </button>
            )}
          </div>
        )}
        
        {/* Analysis response */}
        {analyzeLoading ? (
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              backgroundColor: '#F5F8FA',
              borderRadius: '8px',
              border: '1px solid #E1E8ED'
            }}
          >
            Loading...
          </div>
        ) : (
          analyzeResponse && (
            <div
              style={{
                marginTop: '12px',
                padding: '12px',
                backgroundColor: '#F5F8FA',
                borderRadius: '8px',
                border: '1px solid #E1E8ED',
                overflowY: 'auto'
              }}
              dangerouslySetInnerHTML={{ __html: analyzeResponse }}
            />
          )
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
                padding: '10px 15px',
                cursor: 'pointer',
                borderRadius: '8px',
                marginBottom: '6px',
                backgroundColor: selectedNodes.has(node.id) ? '#E8F5FD' : '#F5F8FA',
                borderLeft: selectedNodes.has(node.id) ? '4px solid #1DA1F2' : 'none',
                transition: 'background-color 0.2s ease',
                color: '#14171A'
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
        backgroundColor: '#ffffff'
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

export default App;
