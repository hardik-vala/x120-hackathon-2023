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

  form.reset();

  try {
    const response = await fetchWithTimeout(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        storyId: data.get('storyId')
      }),
      // 30 sec
      timeout: 30000,
    });
    
    if (response.ok) {
      // const data = await response.json();
      const data = await response.text();
      outputContainer.innerHTML = data;
    } else {
      const err = await response.text();
      alert(`code: ${response.status}\nerror: ${response.statusText}`);
    }
  } catch (error) {
    alert(error);
  }
};

form.addEventListener('submit', handleSubmit);