const formulario = document.getElementById('form');

formulario.addEventListener('submit', async function(event) {
  event.preventDefault();

  const formData = new FormData(this);

  const datosFormulario = Object.fromEntries(formData);
  const response = await postData(datosFormulario);
});

async function postData(data) {
  try {
    const response = await fetch("https://api-pizzeria.vercel.app/api/v1/products", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    
    if(!response.ok) {
      throw new Error(`error status: ${respond.status}`);
    }
    
    const rta = await response;
    return rta;
  } catch (error) {
   console.error(error);
  } 
}
