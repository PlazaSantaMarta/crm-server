require('dotenv').config();
const axios = require('axios');

const accessToken = process.env.KOMMO_AUTH_TOKEN;

const axiosInstance = axios.create({
    baseURL: 'https://naobregon27.kommo.com',
    timeout: 5000
});

// 🔍 1. Obtener pipelines (embudos)
async function getPipelines() {
    const res = await axiosInstance.get('/api/v4/leads/pipelines', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    console.log('\n📊 PIPES DISPONIBLES:\n');
    res.data._embedded.pipelines.forEach(p => {
        console.log(`ID: ${p.id} - ${p.name}`);
    });
}

// 🔍 2. Obtener statuses de un pipeline específico
async function getStatuses(pipelineId) {
    const res = await axiosInstance.get(`/api/v4/leads/pipelines/${pipelineId}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    console.log(`\n📍 ESTADOS del Pipeline ${pipelineId}:\n`);
    res.data._embedded.statuses.forEach(s => {
        console.log(`ID: ${s.id} - ${s.name}`);
    });
}

// 🔍 3. Obtener campos personalizados de contactos
async function getContactFields() {
    const res = await axiosInstance.get('/api/v4/contacts/custom_fields', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    console.log('\n📋 CAMPOS PERSONALIZADOS DE CONTACTO:\n');
    res.data._embedded.custom_fields.forEach(f => {
        console.log(`ID: ${f.id} - CODE: ${f.field_code} - ${f.name}`);
    });
}

// ✅ Ejecutar
(async () => {
    await getPipelines();           // 1. Te muestra los pipelines (embudos)
    await getStatuses(11237339);     // 2. Cambiá el ID si necesitás otro pipeline
    await getContactFields();       // 3. Te muestra los field_id de email/teléfono
})();