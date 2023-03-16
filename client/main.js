import './style.css';

const form = document.querySelector('form');
const outputContainer = document.querySelector('#output_container');

function getServerUrl() {
  if (import.meta.env.PROD) {
    return import.meta.env.VITE_APP_SERVER_URL_PROD;
  }
  return import.meta.env.VITE_APP_SERVER_URL_DEV;
}

// copied from https://dmitripavlutin.com/timeout-fetch-request/
async function fetchWithTimeout(resource, options = {}) {
  // 8 secs
  const { timeout = 8000 } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal  
  });
  clearTimeout(id);
  return response;
}

const handleSubmit = async (e) => {
  e.preventDefault();
  const data = new FormData(form);

  const serverUrl = getServerUrl();
  console.log(`Server URL: ${serverUrl}`);

  const styleSelect = document.getElementById('style');
  console.log(`Selected style: ${styleSelect.value}`);

  form.reset();

  outputContainer.innerHTML = '';

  try {
    const response = await fetchWithTimeout(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        storyId: data.get('storyId'),
        style: styleSelect.value,
      }),
      // 60 sec
      timeout: 60000,
    });
    
    if (response.ok) {
      const data = await response.json();
      outputContainer.innerHTML += `<div>Summary: ${data.completion}</div>`;
      for (let i = 0; i < data.flattenedStory.length; i++) {
        outputContainer.innerHTML += `<div>Author: ${data.flattenedStory[i].by}</div>`;
        outputContainer.innerHTML += `<div>Comment: ${data.flattenedStory[i].text}</div>`;
      }
    } else {
      const err = await response.text();
      alert(`code: ${response.status}\nerror: ${response.statusText}`);
    }
  } catch (error) {
    alert(error);
  }
};

form.addEventListener('submit', handleSubmit);