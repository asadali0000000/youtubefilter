const c={keywords:[],apiKey:""},E=document.createElement("style");E.textContent=`
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


`;document.head.appendChild(E);console.log("Content script initialized");chrome.storage.sync.get(["keywords","apiKey"],e=>{console.log("Retrieved settings - API key:",e.apiKey?"Present":"Missing","Keywords:",e.keywords),e.keywords&&(c.keywords=e.keywords),e.apiKey&&(c.apiKey=e.apiKey)});chrome.storage.onChanged.addListener(e=>{console.log("Settings changed"),e.keywords&&(c.keywords=e.keywords.newValue),e.apiKey&&(c.apiKey=e.apiKey.newValue)});const u=new Map,w=15,d=[];let y=!1,a=null;function k(e){return"video-"+Math.random().toString(36).substring(2,15)}function x(e,t){if(!t||!e)return;console.log(`Blurring video: ${t}`);const n=`blurred-${t}`;if(!document.getElementById(`style-${n}`)){const r=document.createElement("style");r.id=`style-${n}`,r.textContent=`
      .${n} {
        position: relative;
        pointer-events: none;
      }
    `,document.head.appendChild(r)}e.classList.add(n),e.setAttribute("data-blur-id",t);const o=document.createElement("button");o.textContent="Show Anyway",o.className="show-anyway-button",o.dataset.videoId=t,o.addEventListener("click",r=>{r.stopPropagation(),p(t)}),e.style.position="relative",e.appendChild(o),u.set(t,{uniqueId:n,element:e,styleId:`style-${n}`,buttonElement:o})}function p(e){if(!e)return;console.log(`Attempting to unblur video: ${e}`);const t=u.get(e);if(!t){console.log(`No blur info found for video ID: ${e}`);return}if(t.element&&t.uniqueId&&(console.log(`Removing blur class ${t.uniqueId} from element`),t.element.classList.remove(t.uniqueId)),t.buttonElement&&t.buttonElement.remove(),document.querySelectorAll(`.${t.uniqueId}`).length===0){const o=document.getElementById(t.styleId);o&&(console.log(`Removing style element: ${t.styleId}`),o.remove())}u.delete(e),console.log(`Removed video ID ${e} from blurred videos map. Current count: ${u.size}`)}function h(e){if(e.hasAttribute("data-processed"))return;e.setAttribute("data-processed","true"),console.log("Processing video element",e.tagName);const t=k();if(!t)return;const n=e.querySelector("#video-title")||e.querySelector("a#video-title-link")||e.querySelector("h3 a#video-title");if(!n){console.log("No title element found");return}const o=n.innerText||n.textContent;console.log("Found video:",o),e.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),A(e,t)}),x(e,t),d.push({title:o,videoId:t,element:e}),!y&&!a&&(a=setTimeout(()=>{f()},1e3))}async function f(){if(y||d.length===0)return;a&&(clearTimeout(a),a=null),y=!0,console.log(`Processing batch of ${d.length} titles`);const e=d.splice(0,w);if(e.length>0)try{const t=e.map(o=>o.title),n=await C(t,c.keywords,c.apiKey);e.forEach((o,r)=>{n[r]?console.log("Video matches keywords, blurring:",o.title):(console.log("Video does not match keywords, unblurring :",o.title),p(o.videoId))})}catch(t){console.error("Error processing batch:",t),e.forEach(n=>p(n.videoId))}y=!1,d.length>0&&(a=setTimeout(()=>{f()},500))}async function C(e,t,n){if(console.log("Checking batch with Gemini, titles:",e.length),!n)return console.error("Gemini API key not set"),e.map(()=>!1);if(!t||t.length===0)return e.map(()=>!1);const o=`
  I have ${e.length} YouTube video titles to analyze. For each title, determine if it is relevant to any of these keywords or topic areas:
  ${t.join(", ")}
  
  Important matching instructions:
  1. Consider both exact keyword matches AND conceptually related content
  2. Include synonyms, subtopics, and specialized terminology related to each keyword
  3. Match based on semantic relevance and topical connection, not just literal word matching
  4. Consider the context and intended audience of the content
  5. If a title contains technical terms, tools, or methodologies associated with any keyword, consider it a match
  
  Titles to check:
  ${e.map((r,s)=>`${s+1}. "${r}"`).join(`
`)}
  
  Respond with a JSON array of boolean values (true/false) for each title, where:
  - true = title is related to or falls within the scope of any keyword
  - false = title is unrelated to all keywords and their associated topics
  
  Example response format: [true, false, true, ...]
  
  Return only the JSON array with no additional explanation.
`;console.log(o);try{const s=await(await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${n}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:o}]}]})})).json();if(console.log("Gemini response:",s),s.candidates&&s.candidates[0]&&s.candidates[0].content){const i=s.candidates[0].content.parts[0].text.trim();try{const l=i.match(/\[.*\]/s);if(l){const m=JSON.parse(l[0]);if(console.log("Parsed result array:",m),Array.isArray(m)&&m.length===e.length)return m}}catch(l){console.error("Error parsing response:",l)}}return console.log("Failed to parse response, defaulting to true for all titles"),e.map(()=>!1)}catch(r){return console.error("Error calling Gemini API:",r),e.map(()=>!1)}}const b=new MutationObserver(e=>{for(const t of e)t.addedNodes.length&&t.addedNodes.forEach(n=>{n.nodeType===Node.ELEMENT_NODE&&((n.tagName==="YTD-RICH-GRID-MEDIA"||n.tagName==="YTD-VIDEO-RENDERER"||n.tagName==="YTD-GRID-VIDEO-RENDERER")&&h(n),n.querySelectorAll("ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer").forEach(h))})});function g(){console.log("Initializing observer"),b.disconnect();const e=document.querySelector("ytd-app");if(e&&b.observe(e,{childList:!0,subtree:!0}),document.querySelectorAll("ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer").forEach(h),location.pathname==="/watch"){const t=document.querySelector("video.html5-main-video");if(t){const n=t.closest(".html5-video-container")||t.parentElement;n&&h(n)}}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",g):g();async function S(e,t){if(console.log("Analyzing with Gemini:",e),!t)return console.error("Gemini API key not set"),{summary:"API key not set.",racism_score:"N/A"};const n=`
    Analyze the following YouTube video title and provide a brief summary and a racism score.
    The racism score should be a number between 0 and 1, where 0 is not racist and 1 is very racist.

    Title: "${e}"

    Respond with a JSON object with two keys: "summary" and "racism_score".

    Example response format: {"summary": "This video is about...", "racism_score": 0.2}

    Return only the JSON object with no additional explanation.
  `;try{const r=await(await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${t}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:n}]}]})})).json();if(console.log("Gemini response:",r),r.candidates&&r.candidates[0]&&r.candidates[0].content){const s=r.candidates[0].content.parts[0].text.trim();try{const i=s.match(/{.*}/s);if(i){const l=JSON.parse(i[0]);return console.log("Parsed result:",l),l}}catch(i){console.error("Error parsing response:",i)}}return console.log("Failed to parse response, returning default error message."),{summary:"Failed to analyze video.",racism_score:"N/A"}}catch(o){return console.error("Error calling Gemini API:",o),{summary:"Error calling API.",racism_score:"N/A"}}}async function A(e,t){console.log(`Analyzing video: ${t}`);const n=e.querySelector("#video-title")||e.querySelector("a#video-title-link")||e.querySelector("h3 a#video-title");if(!n){console.log("No title element found for analysis");return}const o=n.innerText||n.textContent,r=await S(o,c.apiKey);I(e,r)}function I(e,t){const n=document.getElementById("video-analysis-modal");n&&n.remove();const o=document.createElement("div");o.id="video-analysis-modal",o.style.position="fixed",o.style.top="50%",o.style.left="50%",o.style.transform="translate(-50%, -50%)",o.style.backgroundColor="white",o.style.padding="20px",o.style.border="1px solid black",o.style.zIndex="10000";const r=document.createElement("p");r.textContent=`Summary: ${t.summary}`;const s=document.createElement("p");s.textContent=`Racism Score: ${t.racism_score}`;const i=document.createElement("button");i.textContent="Close",i.addEventListener("click",()=>{o.remove()}),o.appendChild(r),o.appendChild(s),o.appendChild(i),document.body.appendChild(o)}let v=location.href;new MutationObserver(()=>{const e=location.href;e!==v&&(v=e,u.forEach((t,n)=>{t.element&&t.element.removeAttribute("data-processed"),t.buttonElement&&t.buttonElement.remove()}),u.clear(),a&&(clearTimeout(a),a=null),d.length>0&&f(),setTimeout(()=>{g()},1e3))}).observe(document,{subtree:!0,childList:!0});
