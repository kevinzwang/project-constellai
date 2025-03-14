import { useEffect, useRef, useState } from 'react'
import './App.css'
import graphology from 'graphology'
import { Sigma } from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { marked } from 'marked';

// Hardcoded game questions for Wikipedia mode
const hardcodedGameQuestions = [
  {
    node1: "Star Wars",
    node2: "Brad Pitt",
    commonNeighbors: ["Harrison Ford"]
  },
  {
    node1: "Soviet Union",
    node2: "UEFA",
    commonNeighbors: ["Russian Football Union"]
  },
  {
    node1: "Apple Inc.",
    node2: "Jay-Z",
    commonNeighbors: ["Apple Music"]
  }
];

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
  
  // Game mode related states
  const [gameMode, setGameMode] = useState(false);
  const [gameNodes, setGameNodes] = useState({ node1: null, node2: null, commonNeighbors: [] });
  const [userAnswer, setUserAnswer] = useState('');
  const [gameResult, setGameResult] = useState({ shown: false, correct: false });
  const answerInputRef = useRef(null);
  // New game states for tracking guesses and suggestions
  const [wrongGuesses, setWrongGuesses] = useState([]);
  const [guessCount, setGuessCount] = useState(0);
  const [nodeSuggestions, setNodeSuggestions] = useState([]);
  const [revealAnswer, setRevealAnswer] = useState(false);
  
  // Track game session progress for question selection
  const [gameQuestionCount, setGameQuestionCount] = useState(0);
  const [shownHardcodedQuestions, setShownHardcodedQuestions] = useState([]);
  
  // Prepare question tracking when game mode starts
  useEffect(() => {
    if (gameMode) {
      // Reset tracking when starting game mode
      setGameQuestionCount(0);
      setShownHardcodedQuestions([]);
    }
  }, [gameMode]);

  // Function to find nodes that are exactly 2 degrees apart (have common neighbors)
  const findTwoDegreesApartNodes = () => {
    if (!fullGraph) return null;
    
    try {
      // Get all nodes in the graph
      const allNodes = [];
      fullGraph.forEachNode((node) => {
        allNodes.push(node);
      });
      
      if (allNodes.length < 3) {
        console.warn("Not enough nodes in graph for game mode");
        return null;
      }
      
      // Shuffle the nodes to get random selection
      const shuffledNodes = [...allNodes].sort(() => 0.5 - Math.random());
      
      // Try to find a pair of nodes that are exactly 2 degrees apart
      for (let i = 0; i < Math.min(shuffledNodes.length, 50); i++) {
        const node1 = shuffledNodes[i];
        
        if (!fullGraph.hasNode(node1)) continue;
        
        const node1Neighbors = new Set();
        
        // Get direct neighbors of node1
        fullGraph.forEachNeighbor(node1, (neighbor) => {
          node1Neighbors.add(neighbor);
        });
        
        if (node1Neighbors.size === 0) continue;
        
        // Check other nodes to find one that's not a direct neighbor but shares a common neighbor
        for (let j = 0; j < Math.min(shuffledNodes.length, 50); j++) {
          if (i === j) continue;
          
          const node2 = shuffledNodes[j];
          
          if (!fullGraph.hasNode(node2)) continue;
          
          // Skip if node2 is a direct neighbor of node1
          if (node1Neighbors.has(node2)) continue;
          
          const commonNeighbors = [];
          
          // Check if node2 shares any neighbors with node1
          fullGraph.forEachNeighbor(node2, (neighbor) => {
            if (node1Neighbors.has(neighbor)) {
              commonNeighbors.push(neighbor);
            }
          });
          
          // If we found common neighbors, we have nodes that are 2 degrees apart
          if (commonNeighbors.length > 0) {
            // Validate all common neighbors to make sure they exist
            const validCommonNeighbors = commonNeighbors.filter(neighbor => 
              fullGraph.hasNode(neighbor)
            );
            
            if (validCommonNeighbors.length > 0) {
              console.log(`Found game nodes: ${node1} and ${node2} with ${validCommonNeighbors.length} common connections`);
              return {
                node1,
                node2,
                commonNeighbors: validCommonNeighbors
              };
            }
          }
        }
      }
      
      console.warn("Could not find suitable node pairs for game");
      return null;
    } catch (error) {
      console.error("Error finding nodes for game mode:", error);
      return null;
    }
  };

  // Function to start a new game round
  const startNewGameRound = () => {
    try {
      // Increment the game question count
      const newQuestionCount = gameQuestionCount + 1;
      setGameQuestionCount(newQuestionCount);
      
      // Special handling for questions when using Wikipedia mode
      if (dataSource === 'wikipedia') {
        // Check if this position should use a hardcoded question (positions 1, 3, or 5)
        const isHardcodedPosition = newQuestionCount === 1 || newQuestionCount === 3 || newQuestionCount === 5;
        
        if (isHardcodedPosition) {
          // Determine which hardcoded question to use based on position
          let hardcodedIndex;
          
          if (newQuestionCount === 1) {
            hardcodedIndex = 0; // First hardcoded question
          } else if (newQuestionCount === 3) {
            hardcodedIndex = 1; // Second hardcoded question
          } else { // newQuestionCount === 5
            hardcodedIndex = 2; // Third hardcoded question
          }
          
          const selectedQuestion = hardcodedGameQuestions[hardcodedIndex];
          
          // Add this question to the shown list
          const updatedShownQuestions = [...shownHardcodedQuestions, hardcodedIndex];
          setShownHardcodedQuestions(updatedShownQuestions);
          
          if (fullGraph.hasNode(selectedQuestion.node1) && fullGraph.hasNode(selectedQuestion.node2)) {
            // Make sure all common neighbors exist in the graph
            const validCommonNeighbors = selectedQuestion.commonNeighbors.filter(
              neighbor => fullGraph.hasNode(neighbor)
            );
            
            if (validCommonNeighbors.length > 0) {
              console.log(`Using hardcoded question #${hardcodedIndex + 1}: ${selectedQuestion.node1} and ${selectedQuestion.node2}`);
              
              setGameNodes({
                node1: selectedQuestion.node1,
                node2: selectedQuestion.node2,
                commonNeighbors: validCommonNeighbors
              });
              
              setUserAnswer('');
              setGameResult({ shown: false, correct: false });
              setSelectedNodes(new Set([selectedQuestion.node1, selectedQuestion.node2]));
              setWrongGuesses([]); // Reset wrong guesses
              setGuessCount(0); // Reset guess count
              setRevealAnswer(false); // Reset revealed answer state
              setNodeSuggestions([]); // Reset suggestions
              setAnalyzeResponse(''); // Clear any analysis text
              
              // Focus the answer input field
              setTimeout(() => {
                if (answerInputRef.current) {
                  answerInputRef.current.focus();
                }
              }, 100);
              
              return; // Exit early since we've set up the game
            }
          }
        }
      }
      
      // Fall back to dynamic node finding if we can't use a hardcoded question
      const nodePair = findTwoDegreesApartNodes();
      
      if (nodePair && nodePair.node1 && nodePair.node2) {
        setGameNodes(nodePair);
        setUserAnswer('');
        setGameResult({ shown: false, correct: false });
        setSelectedNodes(new Set([nodePair.node1, nodePair.node2]));
        setWrongGuesses([]); // Reset wrong guesses
        setGuessCount(0); // Reset guess count
        setRevealAnswer(false); // Reset revealed answer state
        setNodeSuggestions([]); // Reset suggestions
        setAnalyzeResponse(''); // Clear any analysis text
        
        // Focus the answer input field
        setTimeout(() => {
          if (answerInputRef.current) {
            answerInputRef.current.focus();
          }
        }, 100);
      } else {
        // If no suitable pair is found, disable game mode
        setGameMode(false);
        alert("Couldn't find suitable node pairs for the game. Try with a larger graph.");
      }
    } catch (error) {
      console.error("Error starting new game round:", error);
      setGameMode(false);
      alert("Error starting game. Please try again.");
    }
  };

  // Function to toggle game mode
  const toggleGameMode = () => {
    const newGameMode = !gameMode;
    setGameMode(newGameMode);
    
    if (newGameMode) {
      // Clear any existing selected nodes and analysis
      setSelectedNodes(new Set());
      setAnalyzeResponse('');
      setSearchTerm('');
      setSearchResults([]);
      setWrongGuesses([]); // Reset wrong guesses
      setGuessCount(0); // Reset guess count
      setRevealAnswer(false); // Reset revealed answer state
      setGameQuestionCount(0); // Reset question counter
      setShownHardcodedQuestions([]); // Reset shown questions
      
      // Start a new game round when enabling game mode
      startNewGameRound();
    } else {
      // Reset game state when disabling game mode
      setSelectedNodes(new Set());
      setGameNodes({ node1: null, node2: null, commonNeighbors: [] });
      setUserAnswer('');
      setGameResult({ shown: false, correct: false });
      setAnalyzeResponse('');
      setWrongGuesses([]); // Reset wrong guesses
      setGuessCount(0); // Reset guess count
      setRevealAnswer(false); // Reset revealed answer state
      setGameQuestionCount(0); // Reset question counter
      setShownHardcodedQuestions([]); // Reset shown questions
      
      // Remove any existing keypress listeners
      document.removeEventListener('keydown', handleNewRoundKeyPress);
    }
  };

  // Separate function for the keypress handler to move to next question
  const handleNewRoundKeyPress = () => {
    document.removeEventListener('keydown', handleNewRoundKeyPress);
    startNewGameRound();
  };

  // Function to handle user's answer submission
  const handleAnswerSubmit = (e) => {
    e.preventDefault();
    
    if (!userAnswer.trim()) return;
    
    // Verify that the answer is a valid node in the graph
    if (!fullGraph.hasNode(userAnswer)) {
      return; // Silently ignore invalid guesses
    }
    
    // Clear any existing analysis text
    setAnalyzeResponse('');
    
    // Check if the answer is in the common neighbors (correct)
    const isCorrect = gameNodes.commonNeighbors.includes(userAnswer);
    
    if (isCorrect) {
      // Correct answer
      setGameResult({ 
        shown: true, 
        correct: true
      });
      setRevealAnswer(true);
      
      // Set up event listener for any key press to move to next question
      document.addEventListener('keydown', handleNewRoundKeyPress);
    } else {
      // Incorrect answer - add to wrong guesses if not already there
      if (!wrongGuesses.includes(userAnswer)) {
        const newWrongGuesses = [...wrongGuesses, userAnswer];
        setWrongGuesses(newWrongGuesses);
      }
      
      // Increment guess count
      const newGuessCount = guessCount + 1;
      setGuessCount(newGuessCount);
      
      // Check if they've reached the maximum number of guesses
      if (newGuessCount >= 5) {
        setGameResult({
          shown: true,
          correct: false
        });
        setRevealAnswer(true);
        
        // Set up event listener for any key press to move to next question
        document.addEventListener('keydown', handleNewRoundKeyPress);
      } else {
        // Show temporary incorrect message
        setGameResult({
          shown: true,
          correct: false
        });
        
        // Clear the incorrect message after 1.5 seconds
        setTimeout(() => {
          setGameResult({
            shown: false,
            correct: false
          });
        }, 1500);
      }
    }
    
    // Clear user answer input
    setUserAnswer('');
  };

  // Function to handle skipping the current question
  const handleSkipQuestion = () => {
    setRevealAnswer(true);
    setGameResult({
      shown: true,
      correct: false
    });
    setAnalyzeResponse(''); // Clear any analysis text
    
    // Set up event listener for any key press to move to next question
    document.addEventListener('keydown', handleNewRoundKeyPress);
  };

  // Function to update node suggestions based on user input
  useEffect(() => {
    if (gameMode && fullGraph && userAnswer.trim().length > 0) {
      // Filter nodes that match the user's input and aren't the selected game nodes
      const suggestions = [];
      fullGraph.forEachNode((node, attributes) => {
        if (node.toLowerCase().includes(userAnswer.toLowerCase()) && 
            node !== gameNodes.node1 && 
            node !== gameNodes.node2 &&
            !wrongGuesses.includes(node)) {
          suggestions.push(node);
        }
      });
      
      setNodeSuggestions(suggestions.slice(0, 5)); // Limit to 5 suggestions
    } else {
      setNodeSuggestions([]);
    }
  }, [userAnswer, gameMode, fullGraph, gameNodes, wrongGuesses]);

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
    // Prevent manual node selection during game mode
    if (gameMode) return;
    
    const newSelectedNodes = new Set(selectedNodes)
    
    if (newSelectedNodes.has(nodeId)) {
      newSelectedNodes.delete(nodeId)
    } else {
      newSelectedNodes.add(nodeId)
    }
    
    setSelectedNodes(newSelectedNodes)
  }

  // Function to analyze nodes
  const analyzeNodes = async () => {
    if (selectedNodes.size < 2) return;
    
    // Game mode doesn't use analysis
    if (gameMode) {
      return;
    }
  
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
    if (dataSource == "twitter") {
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
    } else {
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
    }

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
  }, [dataSource, gameMode]) // Add gameMode as a dependency

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
        // Show labels based on game mode or data source
        labelThreshold: gameMode ? 100 : (dataSource === 'twitter' ? 7 : 4),
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
    camera.setState({x: 0.6, y: 0.4, ratio: 1.5})
    
    sigmaRef.current.on('clickNode', ({ node }) => {
      toggleNodeSelection(node)
    })

    sigmaRef.current.on('overNode', ({ node }) => {
      // Only show pointer cursor when not in game mode
      if (!gameMode) {
        document.body.style.cursor = 'pointer'
      }
    })

    sigmaRef.current.on('outNode', () => {
      document.body.style.cursor = 'default'
    })
    
    sigmaRef.current.refresh()
  }

  useEffect(() => {
    if (!fullGraph || !searchTerm || gameMode) {
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
  }, [searchTerm, fullGraph, gameMode])

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
    
    if (gameMode) {
      // Game mode logic
      if (gameNodes.node1 && gameNodes.node2) {
        try {
          // Add the two main game nodes with labels
          if (!fullGraph.hasNode(gameNodes.node1) || !fullGraph.hasNode(gameNodes.node2)) {
            console.error(`Game nodes not found in graph: ${gameNodes.node1} or ${gameNodes.node2} missing`);
            // Exit game mode if the nodes aren't found
            setTimeout(() => {
              setGameMode(false);
              alert("Error: Selected game nodes are no longer in the graph. Exiting game mode.");
            }, 100);
            return;
          }

          const node1Attrs = fullGraph.getNodeAttributes(gameNodes.node1);
          const node2Attrs = fullGraph.getNodeAttributes(gameNodes.node2);
          
          // Add the two main nodes with their labels
          filteredGraph.addNode(gameNodes.node1, {
            ...node1Attrs,
            color: dataSource === 'twitter' ? "#FF3366" : "#FF9800",
            borderWidth: 3,
            size: node1Attrs.size * 1.5,
            forceLabel: true,
            labelSize: 1.4 // Make label bigger
          });
          
          filteredGraph.addNode(gameNodes.node2, {
            ...node2Attrs,
            color: dataSource === 'twitter' ? "#FF3366" : "#FF9800",
            borderWidth: 3,
            size: node2Attrs.size * 1.5,
            forceLabel: true,
            labelSize: 1.4 // Make label bigger
          });
          
          // Track added nodes to avoid duplicates
          const addedNodes = new Set([gameNodes.node1, gameNodes.node2]);
          
          // Add first-degree connections of the game nodes
          const addFirstDegreeConnections = (nodeId, isCommonNeighbor) => {
            if (!fullGraph.hasNode(nodeId)) return;
            
            fullGraph.forEachNeighbor(nodeId, (neighbor) => {
              if (!addedNodes.has(neighbor)) {
                const neighborAttrs = fullGraph.getNodeAttributes(neighbor);
                const isWrongGuess = wrongGuesses.includes(neighbor);
                const isRevealed = revealAnswer && gameNodes.commonNeighbors.includes(neighbor);
                
                // Determine if this node should have a label
                let shouldShowLabel = isWrongGuess || isRevealed;
                let nodeColor = neighborAttrs.color;
                
                // Check if this is a common neighbor (one we're trying to guess)
                if (isCommonNeighbor) {
                  // Color based on state - purple if hidden, green if revealed
                  nodeColor = isRevealed ? "#4CAF50" : "#8A2BE2";
                } else if (isWrongGuess) {
                  // Wrong guesses are red
                  nodeColor = "#FF3366";
                }
                
                filteredGraph.addNode(neighbor, {
                  ...neighborAttrs,
                  // Show label if it's a wrong guess or a revealed answer
                  label: shouldShowLabel ? neighborAttrs.label : '',
                  forceLabel: shouldShowLabel,
                  color: nodeColor,
                  size: neighborAttrs.size * (isCommonNeighbor || isWrongGuess ? 1.2 : 0.8),
                  labelSize: shouldShowLabel ? 1.2 : 1.0
                });
                
                addedNodes.add(neighbor);
              }
            });
          };
          
          // Add node1's neighbors
          addFirstDegreeConnections(gameNodes.node1, false);
          
          // Add node2's neighbors
          addFirstDegreeConnections(gameNodes.node2, false);
          
          // Find and add common neighbors with special styling
          gameNodes.commonNeighbors.forEach(commonNeighbor => {
            if (fullGraph.hasNode(commonNeighbor)) {
              if (!addedNodes.has(commonNeighbor)) {
                const neighborAttrs = fullGraph.getNodeAttributes(commonNeighbor);
                const isRevealed = revealAnswer;
                
                filteredGraph.addNode(commonNeighbor, {
                  ...neighborAttrs,
                  // Only show label if the answer is revealed
                  label: isRevealed ? neighborAttrs.label : '',
                  forceLabel: isRevealed,
                  // Color based on state - purple if hidden, green if revealed
                  color: isRevealed ? "#4CAF50" : "#8A2BE2",
                  size: neighborAttrs.size * 1.2,
                  labelSize: isRevealed ? 1.2 : 1.0
                });
                
                addedNodes.add(commonNeighbor);
              } else {
                // Update existing node to be properly colored
                const isRevealed = revealAnswer;
                filteredGraph.setNodeAttribute(commonNeighbor, 'color', isRevealed ? "#4CAF50" : "#8A2BE2");
                filteredGraph.setNodeAttribute(commonNeighbor, 'label', isRevealed ? fullGraph.getNodeAttribute(commonNeighbor, 'label') : '');
                filteredGraph.setNodeAttribute(commonNeighbor, 'forceLabel', isRevealed);
              }
            }
          });
          
          // Add wrong guesses and their connections if they aren't already added
          wrongGuesses.forEach(wrongGuess => {
            if (fullGraph.hasNode(wrongGuess) && !addedNodes.has(wrongGuess)) {
              const wrongGuessAttrs = fullGraph.getNodeAttributes(wrongGuess);
              
              filteredGraph.addNode(wrongGuess, {
                ...wrongGuessAttrs,
                label: wrongGuessAttrs.label, // Always show label for wrong guesses
                forceLabel: true,
                color: "#FF3366", // Wrong guesses are red
                size: wrongGuessAttrs.size * 1.2,
                labelSize: 1.2
              });
              
              addedNodes.add(wrongGuess);
              
              // Add first-degree connections of the wrong guess
              addFirstDegreeConnections(wrongGuess, false);
            }
          });
          
          // Add all edges between nodes that have been added to the filtered graph
          fullGraph.forEachEdge((edge, attributes, source, target) => {
            if (addedNodes.has(source) && addedNodes.has(target)) {
              try {
                // Check if this edge connects to a common neighbor
                const isCommonNeighborEdge = 
                  (gameNodes.commonNeighbors.includes(source) || gameNodes.commonNeighbors.includes(target)) &&
                  (source === gameNodes.node1 || target === gameNodes.node1 || 
                   source === gameNodes.node2 || target === gameNodes.node2);
                
                const isWrongGuessEdge = wrongGuesses.includes(source) || wrongGuesses.includes(target);
                
                // Determine edge color based on what it connects
                let edgeColor = "#AAB8C2"; // Default gray
                if (isCommonNeighborEdge) {
                  edgeColor = revealAnswer ? "#4CAF50" : "#8A2BE2"; // Color matches node
                } else if (isWrongGuessEdge) {
                  edgeColor = "#FF3366"; // Wrong guess color
                } else if ((source === gameNodes.node1 && target === gameNodes.node2) || 
                           (source === gameNodes.node2 && target === gameNodes.node1)) {
                  edgeColor = dataSource === 'twitter' ? "#FF3366" : "#FF9800"; // Selected nodes color
                }
                
                filteredGraph.addEdge(source, target, { 
                  ...attributes,
                  color: edgeColor,
                  size: isCommonNeighborEdge || isWrongGuessEdge ? 2 : attributes.size
                });
              } catch (error) {
                // Edge might already exist or other issue, just log and continue
                console.error(`Error adding edge between ${source} and ${target}:`, error);
              }
            }
          });
        } catch (error) {
          console.error("Error in game mode graph rendering:", error);
          // Exit game mode if there's an error
          setTimeout(() => {
            setGameMode(false);
            alert("Error rendering game mode. Exiting game mode.");
          }, 100);
          return;
        }
      }
    } else if (selectedNodes.size === 0) {
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
  }, [selectedNodes, fullGraph, gameMode, wrongGuesses, revealAnswer])

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
    
    // Exit game mode if active
    if (gameMode) {
      setGameMode(false)
      setGameNodes({ node1: null, node2: null, commonNeighbors: [] })
      setUserAnswer('')
      setGameResult({ shown: false, correct: false })
    }
    
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
          placeholder={gameMode ? 'Search disabled in Game Mode' : `Search ${dataSource === 'twitter' ? 'users' : 'topics'}...`}
          value={searchTerm}
          onChange={(e) => !gameMode && setSearchTerm(e.target.value)}
          disabled={gameMode}
          style={{
            padding: '12px 15px',
            borderRadius: '9999px',
            border: '1px solid #E1E8ED',
            backgroundColor: gameMode ? '#F0F0F0' : '#F5F8FA',
            fontSize: '15px',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
            outline: 'none',
            color: gameMode ? '#A0A0A0' : 'inherit',
            cursor: gameMode ? 'not-allowed' : 'text'
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
                onClick={!gameMode ? handleClearSelection : undefined}
                style={{
                  padding: '4px 10px',
                  backgroundColor: gameMode ? '#F0F0F0' : '#EFF3F4',
                  border: 'none',
                  borderRadius: '9999px',
                  cursor: gameMode ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  color: gameMode ? '#A0A0A0' : '#536471',
                  fontWeight: '500',
                  transition: 'background-color 0.2s ease',
                  opacity: gameMode ? 0.7 : 1
                }}
                disabled={gameMode}
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
                  onClick={!gameMode ? () => toggleNodeSelection(nodeId) : undefined}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: dataSource === 'twitter' ? '#1DA1F2' : '#4CAF50',
                    color: 'white',
                    borderRadius: '9999px',
                    fontSize: '13px',
                    cursor: gameMode ? 'default' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minWidth: 'fit-content',
                    fontWeight: '500',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                    transition: 'background-color 0.2s ease',
                    opacity: gameMode ? 0.85 : 1
                  }}
                >
                  <span>{nodeId}</span>
                  {!gameMode && <span style={{ marginLeft: '6px', fontWeight: 'bold' }}>×</span>}
                </div>
              ))}
            </div>
            {selectedNodes.size >= 2 && (
              <>
                <button 
                  onClick={gameMode ? undefined : analyzeNodes}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: gameMode ? '#AAB8C2' : '#14171A',
                    color: 'white',
                    border: 'none',
                    borderRadius: '9999px',
                    cursor: gameMode ? 'not-allowed' : 'pointer',
                    marginTop: '10px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    width: '100%',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                    transition: 'background-color 0.2s ease',
                    opacity: gameMode ? 0.7 : 1
                  }}
                  disabled={gameMode}
                >
                  Analyze
                </button>

                {/* Game Mode answer box - now in sidebar */}
                {gameMode && !gameResult.shown && (
                  <div style={{ 
                    marginTop: '16px',
                    borderTop: '1px solid #E1E8ED',
                    paddingTop: '16px'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 8px 0', 
                      fontSize: '15px', 
                      color: '#14171A', 
                      fontWeight: '600',
                      textAlign: 'center'
                    }}>
                      What connects these {dataSource === 'twitter' ? 'users' : 'topics'}?
                    </h3>
                    
                    <p style={{ 
                      fontSize: '13px', 
                      color: '#536471',
                      marginBottom: '10px',
                      textAlign: 'center'
                    }}>
                      Find the common connection between <b>{gameNodes.node1}</b> and <b>{gameNodes.node2}</b>
                    </p>
                    
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '10px'
                    }}>
                      <div style={{ fontSize: '13px', color: '#536471' }}>
                        Guesses left: <b>{5 - guessCount}</b>
                      </div>
                      <button
                        onClick={handleSkipQuestion}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#EFF3F4',
                          color: '#536471',
                          border: 'none',
                          borderRadius: '9999px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}
                      >
                        Skip
                      </button>
                    </div>
                    
                    <form onSubmit={handleAnswerSubmit} style={{ width: '100%', position: 'relative' }}>
                      <input
                        ref={answerInputRef}
                        type="text"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Type to find a node..."
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '9999px',
                          border: '1px solid #E1E8ED',
                          backgroundColor: '#F5F8FA',
                          fontSize: '14px',
                          color: '#14171A',
                          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
                          outline: 'none',
                          marginBottom: nodeSuggestions.length > 0 ? '0' : '10px',
                          transition: 'border-color 0.2s ease',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box'
                        }}
                      />
                      
                      {/* Node suggestions dropdown */}
                      {nodeSuggestions.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          width: '100%',
                          backgroundColor: 'white',
                          borderRadius: '0 0 16px 16px',
                          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                          zIndex: 10,
                          maxHeight: '150px',
                          overflowY: 'auto',
                          marginBottom: '10px',
                          border: '1px solid #E1E8ED',
                          borderTop: 'none'
                        }}>
                          {nodeSuggestions.map((node) => (
                            <div
                              key={node}
                              onClick={() => {
                                setUserAnswer(node);
                                // Submit after a short delay to allow UI update
                                setTimeout(() => {
                                  handleAnswerSubmit({ preventDefault: () => {} });
                                }, 100);
                              }}
                              style={{
                                padding: '10px 14px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #F0F0F0',
                                fontSize: '14px',
                                color: '#14171A',
                                transition: 'background-color 0.2s ease',
                                ':hover': {
                                  backgroundColor: '#F5F8FA'
                                }
                              }}
                            >
                              {node}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <button 
                        type="submit"
                        style={{
                          padding: '8px 20px',
                          backgroundColor: dataSource === 'twitter' ? '#1DA1F2' : '#4CAF50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '9999px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '14px',
                          width: '100%',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                          transition: 'background-color 0.2s ease',
                          marginTop: nodeSuggestions.length > 0 ? '10px' : '0'
                        }}
                      >
                        Submit Guess
                      </button>
                    </form>
                  </div>
                )}

                {/* Game Mode result */}
                {gameMode && gameResult.shown && (
                  <div style={{ 
                    marginTop: '16px',
                    borderTop: '1px solid #E1E8ED',
                    paddingTop: '16px',
                    textAlign: 'center'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 8px 0', 
                      color: gameResult.correct ? '#4CAF50' : '#FF3366',
                      fontSize: '17px',
                      fontWeight: '600'
                    }}>
                      {gameResult.correct ? '✓ Correct!' : '✗ Wrong!'}
                    </h3>
                    
                    {revealAnswer && !gameResult.correct && (
                      <div>
                        <p style={{ color: '#536471', fontSize: '14px', margin: '8px 0' }}>
                          The correct {gameNodes.commonNeighbors.length > 1 ? 'answers were' : 'answer was'}:
                        </p>
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px',
                          justifyContent: 'center',
                          marginTop: '6px'
                        }}>
                          {gameNodes.commonNeighbors.map(node => (
                            <span 
                              key={node}
                              style={{
                                padding: '3px 10px',
                                backgroundColor: '#4CAF50',
                                color: 'white',
                                borderRadius: '9999px',
                                fontSize: '13px',
                                fontWeight: '500'
                              }}
                            >
                              {node}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Only show "Press any key to continue" when the game round is finished */}
                    {(gameResult.correct || revealAnswer) && (
                      <p style={{ 
                        fontSize: '13px', 
                        color: '#536471',
                        marginTop: '10px',
                        fontStyle: 'italic'
                      }}>
                        Press any key to continue
                      </p>
                    )}
                    
                    {/* For temporary wrong answers, show a different message */}
                    {!gameResult.correct && !revealAnswer && (
                      <p style={{ 
                        fontSize: '13px', 
                        color: '#536471',
                        marginTop: '10px'
                      }}>
                        Try again! {5 - guessCount} {5 - guessCount === 1 ? 'guess' : 'guesses'} remaining
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        
        {/* Analysis response */}
        {!gameMode && analyzeLoading ? (
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
          !gameMode && analyzeResponse && (
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
          {!gameMode && (
            <>
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
            </>
          )}
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
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '12px' 
          }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#14171A' }}>
              Graph Legend
            </div>
            
            {/* Game Mode Toggle Button */}
            <button 
              onClick={toggleGameMode}
              style={{
                padding: '4px 10px',
                backgroundColor: gameMode ? '#FF3366' : '#EFF3F4',
                color: gameMode ? 'white' : '#536471',
                border: 'none',
                borderRadius: '9999px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                transition: 'background-color 0.2s ease'
              }}
            >
              {gameMode ? 'Exit Game' : 'Game Mode'}
            </button>
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
          {gameMode && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                backgroundColor: '#8A2BE2',
                marginRight: '10px',
                border: '1px solid #ffffff'
              }}></div>
              <div style={{ fontSize: '14px', color: '#536471' }}>
                Hidden Connection
              </div>
            </div>
          )}
          {gameMode && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                backgroundColor: '#FF3366',
                marginRight: '10px',
                border: '1px solid #ffffff'
              }}></div>
              <div style={{ fontSize: '14px', color: '#536471' }}>
                Wrong Guess
              </div>
            </div>
          )}
          {gameMode && revealAnswer && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                backgroundColor: '#4CAF50',
                marginRight: '10px',
                border: '1px solid #ffffff'
              }}></div>
              <div style={{ fontSize: '14px', color: '#536471' }}>
                Correct Answer
              </div>
            </div>
          )}
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
