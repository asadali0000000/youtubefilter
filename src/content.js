// YouTube video filter content script
const settings = {
  keywords: [],
  apiKey: ''
};
const styleElement = document.createElement("style");
styleElement.textContent = `
    .show-anyway-button {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: black;
    color: white;
    padding: 10px 20px;
    font-size: 16px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    width:100%;
    height:100%;
    pointer-events: auto;
  }


`;
document.head.appendChild(styleElement);
console.log("Content script initialized");

// Get settings from storage on initialization
chrome.storage.sync.get(['keywords', 'apiKey'], (result) => {
  console.log("Retrieved settings - API key:", result.apiKey ? "Present" : "Missing", "Keywords:", result.keywords);
  if (result.keywords) settings.keywords = result.keywords;
  if (result.apiKey) settings.apiKey = result.apiKey;
});

// Listen for changes in settings
chrome.storage.onChanged.addListener((changes) => {
  console.log("Settings changed");
  if (changes.keywords) settings.keywords = changes.keywords.newValue;
  if (changes.apiKey) settings.apiKey = changes.apiKey.newValue;
});

// Use a Map to track blurred videos
const blurredVideos = new Map();

// Batch processing variables
const batchSize = 15; // Process 15 titles per batch
const titleBatch = [];
let processingBatch = false;
let batchProcessTimer = null;

// Function to generate a consistent video ID
function extractVideoId(element) {

  return 'video-' + Math.random().toString(36).substring(2, 15);
}

// Function to blur a specific video
function blurVideo(element, videoId) {
  if (!videoId || !element) return;

  console.log(`Blurring video: ${videoId}`);

  // Create a unique identifier for this element
  const uniqueId = `blurred-${videoId}`;

  // Apply blur directly to the element using a class
  // First, create a style for this specific blur if it doesn't exist
  // Note instead of blur i put the showanyway button in whole thumbnail so not confuse if anyone reading ,
  // i blur the content bfore but  show anyway button was not coming on top of the
  if (!document.getElementById(`style-${uniqueId}`)) {
    const styleElement = document.createElement('style');
    styleElement.id = `style-${uniqueId}`;
    styleElement.textContent = `
      .${uniqueId} {
        position: relative;
        pointer-events: none;
      }
    `;
    document.head.appendChild(styleElement);
  }

  // Add the blur class to the element
  element.classList.add(uniqueId);
  element.setAttribute('data-blur-id', videoId);

  // Add the "Show Anyway" button
  const showButton = document.createElement('button');
  showButton.textContent = 'Show Anyway';
  showButton.className = 'show-anyway-button';
  showButton.dataset.videoId = videoId;
  showButton.addEventListener('click', (e) => {
    e.stopPropagation();
    unblurVideo(videoId);
  });

  // Add button to element
  element.style.position = 'relative';
  element.appendChild(showButton);

  // Store reference to this blurred video
  blurredVideos.set(videoId, {
    uniqueId,
    element: element,
    styleId: `style-${uniqueId}`,
    buttonElement: showButton
  });
}

// Function to unblur a specific video
function unblurVideo(videoId) {
  if (!videoId) return;

  console.log(`Attempting to unblur video: ${videoId}`);

  const blurredInfo = blurredVideos.get(videoId);
  if (!blurredInfo) {
    console.log(`No blur info found for video ID: ${videoId}`);
    return;
  }

  // Remove the blur class from the element
  if (blurredInfo.element && blurredInfo.uniqueId) {
    console.log(`Removing blur class ${blurredInfo.uniqueId} from element`);
    blurredInfo.element.classList.remove(blurredInfo.uniqueId);
  }

  // Remove the button
  if (blurredInfo.buttonElement) {
    blurredInfo.buttonElement.remove();
  }

  // Keep the style in place for any other elements using the same class
  // Only remove it if this is the last element using this style
  const otherElementsWithSameClass = document.querySelectorAll(`.${blurredInfo.uniqueId}`);
  if (otherElementsWithSameClass.length === 0) {
    // No other elements using this class, safe to remove the style
    const styleElement = document.getElementById(blurredInfo.styleId);
    if (styleElement) {
      console.log(`Removing style element: ${blurredInfo.styleId}`);
      styleElement.remove();
    }
  }

  // Remove from our tracked blurred videos
  blurredVideos.delete(videoId);
  console.log(`Removed video ID ${videoId} from blurred videos map. Current count: ${blurredVideos.size}`);
}

// Function to process a video thumbnail or player
function processVideo(element) {
  // Skip if already processed
  if (element.hasAttribute('data-processed')) return;
  element.setAttribute('data-processed', 'true');

  console.log("Processing video element", element.tagName);

  // Extract video ID
  const videoId = extractVideoId(element);
  if (!videoId) return;

  // Find the title in the element
  const titleElement = element.querySelector('#video-title') ||
                       element.querySelector('a#video-title-link') ||
                       element.querySelector('h3 a#video-title');

  if (!titleElement) {
    console.log("No title element found");
    return;
  }

  const title = titleElement.innerText || titleElement.textContent;
  console.log("Found video:", title);

  // Add click listener for analysis
  element.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    analyzeVideo(element, videoId);
  });

  // Blur initially
  blurVideo(element, videoId);

  // Add to batch for processing
  titleBatch.push({
    title,
    videoId,
    element
  });

  // Start batch processing timer if not already running
  if (!processingBatch && !batchProcessTimer) {
    batchProcessTimer = setTimeout(() => {
      processBatch();
    }, 1000); // Process batch after 1 second of inactivity
  }
}

// Function to process a batch of titles
async function processBatch() {
  if (processingBatch || titleBatch.length === 0) return;
  
  // Clear the timer
  if (batchProcessTimer) {
    clearTimeout(batchProcessTimer);
    batchProcessTimer = null;
  }
  
  processingBatch = true;
  console.log(`Processing batch of ${titleBatch.length} titles`);
  
  // Take up to batchSize items from the batch
  const currentBatch = titleBatch.splice(0, batchSize);
  
  if (currentBatch.length > 0) {
    try {
      // Check titles batch with API
      const titlesToCheck = currentBatch.map(item => item.title);
      const results = await checkBatchWithGemini(titlesToCheck, settings.keywords, settings.apiKey);
      
      // Process results
      currentBatch.forEach((item, index) => {
        //doing this so we can exclude that topic videos from page instead of showing one topic video we did
        const isRelevant = (results[index]);
        if (isRelevant) {
          console.log("Video matches keywords, blurring:", item.title);
        } else {
          console.log("Video does not match keywords, unblurring :", item.title);
          unblurVideo(item.videoId);
        }
      });
    } catch (error) {
      console.error("Error processing batch:", error);
      // On error, unblur all videos in the batch to avoid hiding content
      currentBatch.forEach(item => unblurVideo(item.videoId));
    }
  }
  
  processingBatch = false;
  
  // If there are more items in the batch, process them
  if (titleBatch.length > 0) {
    batchProcessTimer = setTimeout(() => {
      processBatch();
    }, 500);
  }
}

// Function to check multiple titles in one API call
async function checkBatchWithGemini(titles, keywords, apiKey) {
  console.log("Checking batch with Gemini, titles:", titles.length);
    
  if (!apiKey) {
    console.error('Gemini API key not set');
    return titles.map(() => false);  
  }
  
  if (!keywords || keywords.length === 0) {
    return titles.map(() => false);  
  }
  const prompt = `
  I have ${titles.length} YouTube video titles to analyze. For each title, determine if it is relevant to any of these keywords or topic areas:
  ${keywords.join(', ')}
  
  Important matching instructions:
  1. Consider both exact keyword matches AND conceptually related content
  2. Include synonyms, subtopics, and specialized terminology related to each keyword
  3. Match based on semantic relevance and topical connection, not just literal word matching
  4. Consider the context and intended audience of the content
  5. If a title contains technical terms, tools, or methodologies associated with any keyword, consider it a match
  
  Titles to check:
  ${titles.map((title, index) => `${index + 1}. "${title}"`).join('\n')}
  
  Respond with a JSON array of boolean values (true/false) for each title, where:
  - true = title is related to or falls within the scope of any keyword
  - false = title is unrelated to all keywords and their associated topics
  
  Example response format: [true, false, true, ...]
  
  Return only the JSON array with no additional explanation.
`;
  console.log(prompt)
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });
    
    const data = await response.json();
    console.log("Gemini response:", data);
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const responseText = data.candidates[0].content.parts[0].text.trim();
      try {
        // Try to parse the JSON array from the response
        const jsonMatch = responseText.match(/\[.*\]/s);
        if (jsonMatch) {
          const resultArray = JSON.parse(jsonMatch[0]);
          console.log("Parsed result array:", resultArray);
          
          // Make sure we have the right number of results
          if (Array.isArray(resultArray) && resultArray.length === titles.length) {
            return resultArray;
          }
        }
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
      }
    }
    
    console.log("Failed to parse response, defaulting to true for all titles");
    return titles.map(() =>false); // Default to showing all content on parse error
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return titles.map(() => false); // Default to showing all content on API error
  }
}
// async function checkBatchWithGemini(titles, keywords, apiKey) {
//   console.log("Checking batch with Gemini, titles:", titles.length);
//   apiKey="";
//   if (!apiKey) {
//     console.error('Gemini API key not set');
//     return titles.map(() => true); // Default to showing content if no API key
//   }
  
//   if (!keywords || keywords.length === 0) {
//     return titles.map(() => true); // No keywords to filter against
//   }
  
//   const prompt = `
//     I have ${titles.length} YouTube video titles. For each title, check if it matches or is relevant to any of the following keywords or phrases:
//     ${keywords.join(', ')}
    
//     Titles to check:
//     ${titles.map((title, index) => `${index + 1}. "${title}"`).join('\n')}
    
//     Respond with a JSON array of boolean values (true/false) for each title, where true means the title is relevant to the keywords and false means it is not relevant. 
//     Example response format: [true, false, true, ...]
    
//     Do not include any explanation, just return the JSON array.
//   `;
  
//   try {
//     const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${apiKey}`,
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify({
//         model: "deepseek-ai/DeepSeek-V3",
//         messages: [
//           {
//             role: "user",
//             content: prompt
//           }
//         ],
//         stream: false,
//         max_tokens: 1024,
//         temperature: 0.3  // Using lower temperature for more consistent results
//       })
//     });
    
//     const data = await response.json();
//     console.log("Chutes API response:", data);
    
//     // Extract the response content from the new API format
//     if (data.choices && data.choices[0] && data.choices[0].message) {
//       const responseText = data.choices[0].message.content.trim();
//       try {
//         // Try to parse the JSON array from the response
//         const jsonMatch = responseText.match(/\[.*\]/s);
//         if (jsonMatch) {
//           const resultArray = JSON.parse(jsonMatch[0]);
//           console.log("Parsed result array:", resultArray);
          
//           // Make sure we have the right number of results
//           if (Array.isArray(resultArray) && resultArray.length === titles.length) {
//             return resultArray;
//           }
//         }
//       } catch (parseError) {
//         console.error("Error parsing response:", parseError);
//       }
//     }
    
//     console.log("Failed to parse response, defaulting to true for all titles");
//     return titles.map(() => false); // Default to showing all content on parse error
//   } catch (error) {
//     console.error('Error calling Chutes API:', error);
//     return titles.map(() => false); // Default to showing all content on API error
//   }
// }
// Observer to detect new videos loaded
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for video elements
          if (node.tagName === 'YTD-RICH-GRID-MEDIA' || 
              node.tagName === 'YTD-VIDEO-RENDERER' || 
              node.tagName === 'YTD-GRID-VIDEO-RENDERER') {
            processVideo(node);
          }
          
          // Check for elements inside the node
          const videoElements = node.querySelectorAll('ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer');
          videoElements.forEach(processVideo);
        }
      });
    }
  }
});

// Start observing when DOM is ready
function initObserver() {
  console.log("Initializing observer");
   observer.disconnect()
  // For video thumbnails in search/homepage
  const contentArea = document.querySelector('ytd-app');
  if (contentArea) {
    observer.observe(contentArea, { childList: true, subtree: true });
  }
  
  // Process videos that are already on the page
  document.querySelectorAll('ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer').forEach(processVideo);
  
  // Process main video if on watch page
  if (location.pathname === '/watch') {
    const videoPlayer = document.querySelector('video.html5-main-video');
    if (videoPlayer) {
      const container = videoPlayer.closest('.html5-video-container') || videoPlayer.parentElement;
      if (container) {
        processVideo(container);
      }
    }
  }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initObserver);
} else {
  initObserver();
}

async function analyzeWithGemini(title, apiKey) {
  console.log("Analyzing with Gemini:", title);

  if (!apiKey) {
    console.error('Gemini API key not set');
    return { summary: "API key not set.", racism_score: "N/A" };
  }

  const prompt = `
    Analyze the following YouTube video title and provide a brief summary and a racism score.
    The racism score should be a number between 0 and 1, where 0 is not racist and 1 is very racist.

    Title: "${title}"

    Respond with a JSON object with two keys: "summary" and "racism_score".

    Example response format: {"summary": "This video is about...", "racism_score": 0.2}

    Return only the JSON object with no additional explanation.
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    const data = await response.json();
    console.log("Gemini response:", data);

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const responseText = data.candidates[0].content.parts[0].text.trim();
      try {
        const jsonMatch = responseText.match(/{.*}/s);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          console.log("Parsed result:", result);
          return result;
        }
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
      }
    }

    console.log("Failed to parse response, returning default error message.");
    return { summary: "Failed to analyze video.", racism_score: "N/A" };
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return { summary: "Error calling API.", racism_score: "N/A" };
  }
}

async function analyzeVideo(element, videoId) {
  console.log(`Analyzing video: ${videoId}`);

  const titleElement = element.querySelector('#video-title') ||
                       element.querySelector('a#video-title-link') ||
                       element.querySelector('h3 a#video-title');

  if (!titleElement) {
    console.log("No title element found for analysis");
    return;
  }

  const title = titleElement.innerText || titleElement.textContent;

  const analysis = await analyzeWithGemini(title, settings.apiKey);
  displayAnalysisResults(element, analysis);
}

function displayAnalysisResults(element, analysis) {
  // Remove any existing modal
  const existingModal = document.getElementById('video-analysis-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Create the modal container
  const modal = document.createElement('div');
  modal.id = 'video-analysis-modal';
  modal.style.position = 'fixed';
  modal.style.top = '50%';
  modal.style.left = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  modal.style.backgroundColor = 'white';
  modal.style.padding = '20px';
  modal.style.border = '1px solid black';
  modal.style.zIndex = '10000';

  // Create the content
  const summaryEl = document.createElement('p');
  summaryEl.textContent = `Summary: ${analysis.summary}`;
  const racismEl = document.createElement('p');
  racismEl.textContent = `Racism Score: ${analysis.racism_score}`;

  // Create the close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => {
    modal.remove();
  });

  // Add content to the modal
  modal.appendChild(summaryEl);
  modal.appendChild(racismEl);
  modal.appendChild(closeButton);

  // Add the modal to the page
  document.body.appendChild(modal);
}

// Listen for navigation changes (YouTube is a SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    // Clear existing blurred videos when navigating
    blurredVideos.forEach((info, videoId) => {
      if (info.element) {
        info.element.removeAttribute('data-processed');
      }
      if (info.buttonElement) {
        info.buttonElement.remove();
      }
    });
    blurredVideos.clear();

    // Clear batch processing
    if (batchProcessTimer) {
      clearTimeout(batchProcessTimer);
      batchProcessTimer = null;
    }
    
    // Process any remaining titles in the batch
    if (titleBatch.length > 0) {
      processBatch();
    }
    
    setTimeout(() => {
      initObserver();
    }, 1000); // Small delay to ensure YouTube has loaded content
  }
}).observe(document, { subtree: true, childList: true });