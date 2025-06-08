const axios = require('axios');
const googleContactsService = require('./googleContacts');

class GeneratorLeadsService {
    constructor(credentials = null) {
        console.log('\n📦 Iniciando GeneratorLeadsService');
        this.customFields = null; // Para almacenar los IDs de campos
        if (credentials) {
            console.log('✨ Credenciales recibidas:');
            console.log(JSON.stringify(credentials, null, 2));
            this.updateCredentials(credentials);
        } else {
            console.log('⚠️ No se recibieron credenciales');
        }
    }

    updateCredentials(credentials) {
        try {
            console.log('\n🔄 Actualizando credenciales en GeneratorLeadsService...');
            
            if (!credentials.auth_token) {
                throw new Error('Token de autenticación no proporcionado');
            }

            if (!credentials.base_url) {
                throw new Error('URL base no proporcionada');
            }

            this.accessToken = credentials.auth_token;
            this.baseURL = credentials.base_url;
            
            // Actualizar la instancia de Axios
            this.axiosInstance = axios.create({
                baseURL: this.baseURL,
                timeout: 5000,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('\n✅ Configuración establecida:');
            console.log(`   - URL Base: ${this.baseURL}`);
            console.log(`   - Token configurado: ${this.accessToken.substring(0, 20)}...`);
            console.log(`   - Headers configurados:`, this.axiosInstance.defaults.headers);
        } catch (error) {
            console.error('\n❌ Error al actualizar credenciales:', error.message);
            throw error;
        }
    }

    // 📞 Lista de números de emergencia comunes
    EMERGENCY_NUMBERS = [
        '911', '100', '101', '102', '103', '107',
        '112', '110', '119'
    ];

    // 🔍 Función para validar números de teléfono
    isValidPhoneNumber(phone) {
        if (!phone) return false;

        // Limpiar el número de teléfono
        const cleanPhone = phone
            .replace(/\s+/g, '')           // Eliminar espacios
            .replace(/[-\(\)]/g, '')       // Eliminar guiones y paréntesis
            .replace(/^\+/, '');           // Eliminar el + inicial si existe
        
        // Verificar si es un número de emergencia
        if (this.EMERGENCY_NUMBERS.includes(cleanPhone)) {
            console.log(`❌ Número de emergencia detectado: ${phone}`);
            return false;
        }

        // Verificar que tenga al menos 5 dígitos y no más de 15
        const digits = cleanPhone.replace(/\D/g, '');
        if (digits.length < 5 || digits.length > 15) {
            console.log(`❌ Número inválido (${digits.length} dígitos): ${phone}`);
            return false;
        }

        // Verificar que no comience con * o #
        if (phone.startsWith('*') || phone.startsWith('#')) {
            console.log(`❌ Número inválido (comienza con * o #): ${phone}`);
            return false;
        }
        
        console.log(`✅ Número válido: ${phone} -> ${cleanPhone}`);
        return true;
    }

    // 🔍 1. Obtener pipelines (embudos)
    async getPipelines() {
        try {
            console.log('\n🔍 Iniciando consulta de pipelines...');
            console.log(`   URL completa: ${this.baseURL}/api/v4/leads/pipelines`);
            console.log('   Headers de la petición:', this.axiosInstance.defaults.headers);

            const res = await this.axiosInstance.get('/api/v4/leads/pipelines');
            
            console.log('\n✅ Respuesta recibida:');
            console.log('   Status:', res.status);
            console.log('   Headers:', res.headers);
            
            if (!res.data._embedded?.pipelines) {
                console.error('\n❌ Formato de respuesta inválido:');
                console.error(JSON.stringify(res.data, null, 2));
                throw new Error('Formato de respuesta inválido');
            }

            const pipelines = res.data._embedded.pipelines.map(p => ({
                id: p.id,
                name: p.name
            }));

            console.log(`\n📊 Se encontraron ${pipelines.length} pipelines:`);
            pipelines.forEach(p => console.log(`   - ${p.name} (ID: ${p.id})`));

            return pipelines;
        } catch (error) {
            console.error('\n❌ Error al obtener pipelines:');
            console.error(`   Mensaje: ${error.message}`);
            
            if (error.response) {
                console.error('   Detalles del error:');
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Data:`, error.response.data);
            } else if (error.request) {
                console.error('   No se recibió respuesta del servidor');
            }
            
            throw error;
        }
    }

    // 🔍 2. Obtener statuses de un pipeline específico
    async getStatuses(pipelineId) {
        try {
            const res = await this.axiosInstance.get(`/api/v4/leads/pipelines/${pipelineId}`);

            // Transformar los datos para retornarlos
            const statuses = res.data._embedded.statuses.map(s => ({
                id: s.id,
                name: s.name,
                sort: s.sort,
                color: s.color
            }));

            console.log(`\n📍 ESTADOS del Pipeline ${pipelineId}:\n`);
            statuses.forEach(s => {
                console.log(`ID: ${s.id} - ${s.name}`);
            });

            return statuses;
        } catch (error) {
            console.error('❌ Error al obtener estados:', error.message);
            throw error;
        }
    }

    // Obtener IDs de campos personalizados
    async getCustomFields() {
        try {
            console.log('🔍 Obteniendo campos personalizados...');
            const response = await this.axiosInstance.get('/api/v4/contacts/custom_fields');
            
            if (!response.data._embedded?.custom_fields) {
                throw new Error('No se encontraron campos personalizados');
            }

            const fields = response.data._embedded.custom_fields;
            console.log('📋 Campos encontrados:', fields.map(f => ({ id: f.id, name: f.name, type: f.type })));
            
            // Buscar los campos por tipo y nombre (siendo más flexibles)
            const phoneField = fields.find(f => 
                f.type === 'phone' || 
                f.name.toLowerCase().includes('phone') || 
                f.name.toLowerCase().includes('teléfono') ||
                f.name.toLowerCase().includes('telefono')
            );

            const emailField = fields.find(f => 
                f.type === 'email' || 
                f.name.toLowerCase().includes('email') || 
                f.name.toLowerCase().includes('correo')
            );

            if (!phoneField) {
                // Si no encontramos el campo, crearlo
                console.log('⚠️ Campo de teléfono no encontrado, creando uno nuevo...');
                const newPhoneField = await this.createCustomField('Teléfono', 'phone');
                this.customFields = { phone: newPhoneField.id };
            } else {
                this.customFields = { phone: phoneField.id };
            }

            if (emailField) {
                this.customFields.email = emailField.id;
            }

            console.log('✅ Campos personalizados configurados:');
            console.log(`   - ID Campo Teléfono: ${this.customFields.phone}`);
            if (this.customFields.email) {
                console.log(`   - ID Campo Email: ${this.customFields.email}`);
            }

        } catch (error) {
            console.error('❌ Error al obtener campos personalizados:', error.message);
            throw error;
        }
    }

    // Crear campo personalizado si no existe
    async createCustomField(name, type) {
        try {
            console.log(`📝 Creando campo personalizado: ${name} (${type})`);
            const response = await this.axiosInstance.post('/api/v4/contacts/custom_fields', {
                name: name,
                type: type,
                code: type.toUpperCase(),
                sort: 100,
                is_api_only: false,
                enums: [],
                is_deletable: true,
                is_visible: true,
                is_required: false,
                is_multiple: false
            });
            
            console.log('✅ Campo personalizado creado');
            return response.data;
        } catch (error) {
            console.error('❌ Error al crear campo personalizado:', error);
            throw error;
        }
    }

    // 🧩 Crear contacto con field_id dinámicos
    async createContact(contactData) {
        try {
            // Asegurarnos de tener los IDs de campos
            if (!this.customFields) {
                await this.getCustomFields();
            }

            // Limpiar y formatear el número de teléfono
            const cleanPhone = contactData.phone
                .replace(/\s+/g, '')           // Eliminar espacios
                .replace(/[-\(\)]/g, '')       // Eliminar guiones y paréntesis
                .replace(/^\+/, '');           // Eliminar el + inicial si existe

            const contact = {
                name: contactData.name,
                custom_fields_values: []
            };

            if (cleanPhone) {
                contact.custom_fields_values.push({
                    field_id: this.customFields.phone,
                    values: [{ value: cleanPhone }]
                });
            }

            if (contactData.email && this.customFields.email) {
                contact.custom_fields_values.push({
                    field_id: this.customFields.email,
                    values: [{ value: contactData.email }]
                });
            }

            console.log('📝 Creando contacto con datos:', JSON.stringify(contact, null, 2));

            const response = await this.axiosInstance.post('/api/v4/contacts', [contact]);
            const contactId = response.data._embedded.contacts[0].id;
            console.log('✅ Contacto creado:', contactId);
            return contactId;

        } catch (error) {
            console.error('❌ Error al crear contacto:');
            if (error.response?.data) {
                console.error('Detalles del error:', JSON.stringify(error.response.data, null, 2));
            } else {
                console.error('Error:', error.message);
            }
            throw error;
        }
    }

    // 🧩 Crear lead con contacto ya creado
    async createLead(contactId, contactData, pipeline_id) {
        try {
            if (!pipeline_id) {
                throw new Error('Se requiere especificar el ID del pipeline (embudo de ventas)');
            }

            const leadData = {
                name: `Lead - ${contactData.name}`,
                price: 0,
                pipeline_id: pipeline_id, // Usamos el pipeline_id que nos pasan como parámetro
                _embedded: {
                    contacts: [
                        { id: contactId }
                    ]
                }
            };

            const response = await this.axiosInstance.post('/api/v4/leads', [leadData]);
            const leadId = response.data._embedded.leads[0].id;
            console.log(`✅ Lead creado: ${leadId} para contacto ${contactData.name}`);
            return leadId;

        } catch (error) {
            console.error('❌ Error al crear lead:', error.response?.data || error.message);
            throw error;
        }
    }

    // 📱 Obtener contactos de Google y procesarlos
    async processGoogleContacts(pipeline_id, selectedContactIds = null) {
        try {
            if (!pipeline_id) {
                throw new Error('Se requiere especificar el ID del pipeline (embudo de ventas)');
            }

            // Obtener contactos de Google
            console.log('🔍 Obteniendo contactos de Google...');
            let contacts = await googleContactsService.getContacts();
            
            // Filtrar contactos si hay selección específica
            if (selectedContactIds && selectedContactIds.length > 0) {
                console.log(`🎯 Filtrando ${selectedContactIds.length} contactos seleccionados`);
                contacts = contacts.filter(contact => selectedContactIds.includes(contact.id));
            }
            
            console.log(`✅ Se procesarán ${contacts.length} contactos`);

            const results = {
                total: contacts.length,
                processed: 0,
                filtered: 0,
                contacts: [],
                pipeline_id: pipeline_id
            };

            // Procesar cada contacto
            for (const contact of contacts) {
                try {
                    // Validar el número de teléfono
                    if (!contact.phoneNumber || !this.isValidPhoneNumber(contact.phoneNumber)) {
                        results.filtered++;
                        results.contacts.push({
                            name: contact.name,
                            phone: contact.phoneNumber,
                            success: false,
                            error: 'Número de teléfono inválido'
                        });
                        continue;
                    }

                    // Crear el contacto
                    const contactId = await this.createContact({
                        name: contact.name,
                        phone: contact.phoneNumber,
                        email: null
                    });

                    // Crear el lead asociado al contacto
                    const leadId = await this.createLead(contactId, {
                        name: contact.name,
                        phone: contact.phoneNumber
                    }, pipeline_id);
                    
                    results.contacts.push({
                        name: contact.name,
                        contactId,
                        leadId,
                        success: true
                    });

                    results.processed++;
                    
                    // Esperar 1 segundo entre cada contacto para no sobrecargar la API
                    await new Promise(resolve => setTimeout(resolve, 120000)); //milisegundos = 2 minutos
                } catch (error) {
                    console.error(`❌ Error procesando contacto ${contact.name}:`, error.message);
                    results.contacts.push({
                        name: contact.name,
                        error: error.message,
                        success: false
                    });
                }
            }

            console.log(`✨ Proceso completado:
                - Total contactos: ${results.total}
                - Procesados exitosamente: ${results.processed}
                - Filtrados: ${results.filtered}
                ${selectedContactIds ? '- Modo: Contactos seleccionados' : '- Modo: Todos los contactos'}`);
            return results;

        } catch (error) {
            console.error('❌ Error obteniendo contactos de Google:', error.message);
            throw error;
        }
    }

    async sendWhatsappMessage(contactId, phone, messageText) {
        try {
            const payload = {
                to: phone,
                contact_id: contactId,
                message_type: "text",
                text: messageText
            };

            const response = await this.axiosInstance.post('/api/v4/messages', payload);
            console.log('✅ Mensaje enviado correctamente');
            return response.data;

        } catch (error) {
            console.error('❌ Error al enviar mensaje:');
            console.dir(error.response?.data || error.message, { depth: null });
            throw error;
        }
    }
}

// Exportar la clase
module.exports = GeneratorLeadsService;