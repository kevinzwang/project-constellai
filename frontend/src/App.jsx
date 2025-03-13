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
        const normalizedSize = 5 + ((logFollowers - minLogFollowers) / (maxLogFollowers - minLogFollowers)) * 15

        newGraph.addNode(username, {
          label: username,
          x: Math.random() * 10 - 5,
          y: Math.random() * 10 - 5,
          size: normalizedSize,
          color: "#1DA1F2",
          border: "#ffffff",
          borderWidth: 1.5,
          highlight: "#FF3366"
        })
      })

      edges.user1.forEach((user1, index) => {
        const user2 = edges.user2[index]
        if (newGraph.hasNode(user1) && newGraph.hasNode(user2)) {
          newGraph.addEdge(user1, user2, {
            size: 1.5,
            color: "#AAB8C2",
            type: "arrow"
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
        defaultNodeColor: "#1DA1F2",
        defaultEdgeColor: "#AAB8C2",
        edgeColor: "default",
        labelColor: {
          color: "#000000",
          attribute: null
        },
        labelSize: {
          defaultValue: 12,
          attribute: "size",
          partition: [5, 10, 15, 20],
          values: [11, 12, 13, 14]
        },
        defaultLabelSize: 12,
        labelThreshold: 7,
        defaultEdgeType: "arrow",
        defaultNodeBorderColor: "#ffffff",
        borderSize: 2,
        nodeBorderColor: {
          color: "#ffffff",
          attribute: null
        },
        hoverBorderWidth: 3,
        hoverBorderColor: "#FF3366",
        singleHover: true,
        labelHoverShadow: true,
        labelHoverShadowColor: "#000000",
        nodeHoverColor: {
          color: "#FF3366",
          attribute: null
        },
        defaultNodeHoverColor: "#FF3366",
        defaultHoverLabelBGColor: "#ffffff",
        defaultLabelHoverColor: "#000000",
        edgeHoverSizeRatio: 2,
        edgeHoverExtremities: true,
        drawLabels: true,
        drawEdgeLabels: false,
        defaultEdgeHoverColor: "#000000",
        enableEdgeHovering: true,
        contextSize: 2048,
        canvasSize: 2048
      }
    })
    
    const camera = sigmaRef.current.getCamera()
    camera.setState({x: 0, y: 0, ratio: 1.5})
    
    sigmaRef.current.on('clickNode', ({ node }) => {
      toggleNodeSelection(node)
    })

    sigmaRef.current.on('overNode', ({ node }) => {
      document.body.style.cursor = 'pointer'
    })

    sigmaRef.current.on('outNode', () => {
      document.body.style.cursor = 'default'
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
            borderWidth: isSelected ? 3 : attrs.borderWidth || 1.5,
            size: isSelected ? attrs.size * 1.2 : attrs.size
          })
        }
      })
      
      fullGraph.forEachEdge((edge, attributes, source, target) => {
        if (nodesToShow.has(source) && nodesToShow.has(target)) {
          const isSelectedEdge = selectedNodes.has(source) && selectedNodes.has(target)
          filteredGraph.addEdge(source, target, { 
            ...attributes,
            size: isSelectedEdge ? 2 : attributes.size,
            color: isSelectedEdge ? "#FF3366" : attributes.color
          })
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
      backgroundColor: '#F7F9FA',
      color: '#14171A'
    }}>
      <div style={{
        width: '400px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        borderRight: '1px solid #E1E8ED',
        backgroundColor: '#ffffff',
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.05)'
      }}>
        <h1 style={{ 
          margin: '0',
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#1DA1F2',
          display: 'flex',
          alignItems: 'center'
        }}>
          <span style={{ marginRight: '8px', fontSize: '28px' }}>🪐</span>
          ConstellAI
        </h1>

        <input
          type="text"
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '12px 15px',
            borderRadius: '9999px',
            border: '1px solid #E1E8ED',
            backgroundColor: '#F5F8FA',
            fontSize: '15px',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
            outline: 'none'
          }}
        />
        
        {/* Selected nodes section */}
        {selectedNodes.size > 0 && (
          <div style={{
            marginTop: '8px',
            padding: '12px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #E1E8ED',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#14171A', fontWeight: '600' }}>Selected Nodes ({selectedNodes.size})</h3>
              <button 
                onClick={handleClearSelection}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#EFF3F4',
                  border: 'none',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#536471',
                  fontWeight: '500',
                  transition: 'background-color 0.2s ease'
                }}
              >
                Clear All
              </button>
            </div>
            <div style={{ 
              maxHeight: '100px', 
              overflowY: 'auto',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              padding: '2px 0'
            }}>
              {Array.from(selectedNodes).map(nodeId => (
                <div 
                  key={nodeId}
                  onClick={() => toggleNodeSelection(nodeId)}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: '#1DA1F2',
                    color: 'white',
                    borderRadius: '9999px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minWidth: 'fit-content',
                    fontWeight: '500',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                    transition: 'background-color 0.2s ease'
                  }}
                >
                  <span>{nodeId}</span>
                  <span style={{ marginLeft: '6px', fontWeight: 'bold' }}>×</span>
                </div>
              ))}
            </div>
            {selectedNodes.size >= 2 && (
              <button 
                onClick={analyzeNodes}
                style={{
                  padding: '8px 20px',
                  backgroundColor: '#14171A',
                  color: 'white',
                  border: 'none',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  marginTop: '10px',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  width: '100%',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                  transition: 'background-color 0.2s ease'
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
              marginTop: '10px',
              padding: '0px',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #E1E8ED',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#536471',
              fontSize: '14px'
            }}
          >
            <span style={{ marginRight: '8px' }}>⟳</span> Loading analysis...
          </div>
        ) : (
          analyzeResponse && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 15px 10px 15px',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #E1E8ED',
                overflowY: 'auto',
                color: '#14171A',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                lineHeight: '1.4',
                fontSize: '14px'
              }}
              dangerouslySetInnerHTML={{ __html: analyzeResponse }}
            />
          )
        )}

        {/* Search results */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: searchResults.length > 0 ? '1px solid #E1E8ED' : 'none',
          padding: searchResults.length > 0 ? '15px' : '0',
          marginTop: '10px',
          boxShadow: searchResults.length > 0 ? '0 2px 6px rgba(0, 0, 0, 0.04)' : 'none'
        }}>
          {searchResults.length > 0 && (
            <div style={{ marginBottom: '12px', fontSize: '15px', color: '#536471', fontWeight: '500' }}>
              {searchResults.length} results found
            </div>
          )}
          {searchResults.map((node) => (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node.id)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderRadius: '12px',
                marginBottom: '8px',
                backgroundColor: selectedNodes.has(node.id) ? '#E8F5FD' : '#F7F9FA',
                borderLeft: selectedNodes.has(node.id) ? '4px solid #1DA1F2' : 'none',
                transition: 'all 0.2s ease',
                color: '#14171A',
                fontWeight: selectedNodes.has(node.id) ? '500' : 'normal',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
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
        backgroundColor: '#ffffff',
        boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.03)'
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

        {/* Graph Legend */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
          padding: '15px',
          zIndex: 10,
          width: '220px'
        }}>
          <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: '#14171A' }}>
            Graph Legend
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              backgroundColor: '#1DA1F2',
              marginRight: '10px',
              border: '1px solid #ffffff'
            }}></div>
            <div style={{ fontSize: '14px', color: '#536471' }}>Twitter User</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              backgroundColor: '#FF3366',
              marginRight: '10px',
              border: '1px solid #ffffff'
            }}></div>
            <div style={{ fontSize: '14px', color: '#536471' }}>Selected User</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ 
              width: '20px', 
              height: '2px', 
              backgroundColor: '#AAB8C2',
              marginRight: '10px'
            }}></div>
            <div style={{ fontSize: '14px', color: '#536471' }}>Connection</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App;
