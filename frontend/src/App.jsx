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
  // Change default to 'wikipedia' instead of 'twitter'
  const [dataSource, setDataSource] = useState('twitter');

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

  // New functions to fetch Wikipedia data
  const fetchWikipediaNodes = async () => {
    try {
      const response = await fetch('http://localhost:8000/wikipedia/nodes')
      const nodes = await response.json()
      return nodes
    } catch (error) {
      console.error('Error fetching Wikipedia nodes:', error)
      return { id: [], summary: [], text: [] }
    }
  }

  const fetchWikipediaEdges = async () => {
    try {
      const response = await fetch('http://localhost:8000/wikipedia/edges')
      const edges = await response.json()
      console.log(edges.source.length)
      return edges
    } catch (error) {
      console.error('Error fetching Wikipedia edges:', error)
      return { source: [], target: [], similarity: [] }
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
      
      // Different API endpoint depending on data source
      const endpoint = dataSource === 'twitter' 
        ? 'http://localhost:8000/twitter/connections/'
        : 'http://localhost:8000/wikipedia/connections/';
  
      const response = await fetch(endpoint, {
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
      console.error(`Error analyzing ${dataSource} nodes:`, error);
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
      
      if (dataSource === 'twitter') {
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
      } else {
        // Wikipedia data initialization
        const [nodes, edges] = await Promise.all([
          fetchWikipediaNodes(),
          fetchWikipediaEdges()
        ])
        
        // First, add all nodes to the graph with default size
        nodes.id.forEach((id, index) => {
          const summary = nodes.summary[index] || '';
          
          newGraph.addNode(id, {
            label: id,
            x: Math.random() * 10 - 5,
            y: Math.random() * 10 - 5,
            size: 5, // Initial default size, will be updated based on neighbor count
            color: "#4CAF50", // Different color for Wikipedia nodes
            border: "#ffffff",
            borderWidth: 1.5,
            highlight: "#FF9800",
            summary: summary, // Store summary for tooltips/details
            neighbors: 0 // Initialize neighbor count
          })
        })

        // Add edges - undirected for Wikipedia
        edges.source.forEach((source, index) => {
          const target = edges.target[index];
          
          try {
            if (newGraph.hasNode(source) && newGraph.hasNode(target)) {
              newGraph.addEdge(source, target, {
                size: 1.5, // Standard size for all edges
                color: "#AAB8C2", // Same gray color as Twitter edges
                type: null, // No arrow for Wikipedia edges (undirected)
                similarity: edges.similarity[index] // Store similarity value for potential future use
              })
              
              // Increment neighbor count for both nodes
              const sourceAttrs = newGraph.getNodeAttributes(source);
              const targetAttrs = newGraph.getNodeAttributes(target);
              
              newGraph.setNodeAttribute(source, 'neighbors', sourceAttrs.neighbors + 1);
              newGraph.setNodeAttribute(target, 'neighbors', targetAttrs.neighbors + 1);
            }
          } catch (error) {
            console.error(`Error adding edge between ${source} and ${target}:`, error);
          }
        })
        
        // Update node sizes based on logarithm of neighbor count
        newGraph.forEachNode((node, attributes) => {
          const neighborCount = attributes.neighbors;
          // Use logarithmic scale for node size (add 1 to avoid log(0))
          // Scale ranges from 5 (min) to 15 (max) based on connectivity
          const minSize = 5;
          const maxSize = 15;
          
          if (neighborCount === 0) {
            newGraph.setNodeAttribute(node, 'size', minSize);
          } else {
            const logNeighbors = Math.log(neighborCount + 1);
            // Find reasonable max for scaling
            const logMax = Math.log(50); // Assuming 50 connections is a reasonable upper bound
            const normalizedSize = minSize + (logNeighbors / logMax) * (maxSize - minSize);
            newGraph.setNodeAttribute(node, 'size', normalizedSize);
          }
        });
      }

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
  }, [dataSource]) // Added dataSource as a dependency

  const initializeSigma = (graphData) => {
    if (sigmaRef.current) {
      sigmaRef.current.kill()
    }
    
    sigmaRef.current = new Sigma(graphData, containerRef.current, {
      renderParams: {
        defaultNodeColor: dataSource === 'twitter' ? "#1DA1F2" : "#4CAF50",
        defaultEdgeColor: "#AAB8C2", // Always use same gray color for all edges
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
        // Lower the threshold to show more labels (was 7)
        labelThreshold: dataSource === 'twitter' ? 7 : 4,
        defaultEdgeType: dataSource === 'twitter' ? "arrow" : null, // Only Twitter edges are directed
        defaultNodeBorderColor: "#ffffff",
        borderSize: 2,
        nodeBorderColor: {
          color: "#ffffff",
          attribute: null
        },
        hoverBorderWidth: 3,
        hoverBorderColor: dataSource === 'twitter' ? "#FF3366" : "#FF9800",
        singleHover: true,
        labelHoverShadow: true,
        labelHoverShadowColor: "#000000",
        nodeHoverColor: {
          color: dataSource === 'twitter' ? "#FF3366" : "#FF9800",
          attribute: null
        },
        defaultNodeHoverColor: dataSource === 'twitter' ? "#FF3366" : "#FF9800",
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
          const highlightColor = dataSource === 'twitter' ? "#FF3366" : "#FF9800"
          
          filteredGraph.addNode(nodeId, { 
            ...attrs, 
            color: isSelected ? highlightColor : attrs.color,
            borderWidth: isSelected ? 3 : attrs.borderWidth || 1.5,
            size: isSelected ? attrs.size * 1.2 : attrs.size
          })
        }
      })
      
      fullGraph.forEachEdge((edge, attributes, source, target) => {
        if (nodesToShow.has(source) && nodesToShow.has(target)) {
          const isSelectedEdge = selectedNodes.has(source) && selectedNodes.has(target)
          const highlightColor = dataSource === 'twitter' ? "#FF3366" : "#FF9800"
          
          filteredGraph.addEdge(source, target, { 
            ...attributes,
            size: isSelectedEdge ? 2 : attributes.size,
            color: isSelectedEdge ? highlightColor : "#AAB8C2", // Always use same gray color for normal edges
            type: dataSource === 'twitter' ? attributes.type : null // Preserve directionality only for Twitter
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

  // Toggle data source between Twitter and Wikipedia
  const toggleDataSource = () => {
    // Clear selections and analysis when switching
    setSelectedNodes(new Set())
    setAnalyzeResponse('')
    setSearchTerm('')
    setSearchResults([])
    
    // Toggle the data source
    setDataSource(prevSource => prevSource === 'twitter' ? 'wikipedia' : 'twitter')
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
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ 
            margin: '0',
            fontSize: '24px',
            fontWeight: 'bold',
            color: dataSource === 'twitter' ? '#1DA1F2' : '#4CAF50',
            display: 'flex',
            alignItems: 'center'
          }}>
            <span style={{ marginRight: '8px', fontSize: '28px' }}>
              {dataSource === 'twitter' ? '🪐' : '📚'}
            </span>
            ConstellAI
          </h1>
          
          {/* Data source toggle button */}
          <button
            onClick={toggleDataSource}
            style={{
              padding: '8px 12px',
              backgroundColor: dataSource === 'twitter' ? '#4CAF50' : '#1DA1F2',
              color: 'white',
              border: 'none',
              borderRadius: '9999px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              transition: 'background-color 0.2s ease'
            }}
          >
            {dataSource === 'twitter' ? 'Switch to Wikipedia' : 'Switch to Twitter'}
          </button>
        </div>

        <input
          type="text"
          placeholder={`Search ${dataSource === 'twitter' ? 'users' : 'topics'}...`}
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
              <h3 style={{ margin: 0, fontSize: '15px', color: '#14171A', fontWeight: '600' }}>
                Selected {dataSource === 'twitter' ? 'Users' : 'Topics'} ({selectedNodes.size})
              </h3>
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
                    backgroundColor: dataSource === 'twitter' ? '#1DA1F2' : '#4CAF50',
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
              padding: '12px 15px 12px 15px',
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
                backgroundColor: selectedNodes.has(node.id) ? 
                  (dataSource === 'twitter' ? '#E8F5FD' : '#E8F5E9') : 
                  '#F7F9FA',
                borderLeft: selectedNodes.has(node.id) ? 
                  `4px solid ${dataSource === 'twitter' ? '#1DA1F2' : '#4CAF50'}` : 
                  'none',
                transition: 'all 0.2s ease',
                color: '#14171A',
                fontWeight: selectedNodes.has(node.id) ? '500' : 'normal',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
              }}
            >
              <div>{node.label}</div>
              {/* Show summary for Wikipedia topics */}
              {dataSource === 'wikipedia' && node.summary && (
                <div style={{ 
                  fontSize: '12px', 
                  color: '#657786',
                  marginTop: '4px',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap'
                }}>
                  {node.summary.length > 100 ? 
                    node.summary.substring(0, 100) + '...' : 
                    node.summary}
                </div>
              )}
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
              backgroundColor: dataSource === 'twitter' ? '#1DA1F2' : '#4CAF50',
              marginRight: '10px',
              border: '1px solid #ffffff'
            }}></div>
            <div style={{ fontSize: '14px', color: '#536471' }}>
              {dataSource === 'twitter' ? 'Twitter User' : 'Wikipedia Topic'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              backgroundColor: dataSource === 'twitter' ? '#FF3366' : '#FF9800',
              marginRight: '10px',
              border: '1px solid #ffffff'
            }}></div>
            <div style={{ fontSize: '14px', color: '#536471' }}>
              Selected {dataSource === 'twitter' ? 'User' : 'Topic'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ 
              width: '20px', 
              height: '2px', 
              backgroundColor: "#AAB8C2", // Always use same gray color
              marginRight: '10px'
            }}></div>
            <div style={{ fontSize: '14px', color: '#536471' }}>
              {dataSource === 'twitter' ? 'Connection' : 'Relation'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App;
