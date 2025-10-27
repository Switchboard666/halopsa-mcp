export class HaloPSAClient {
    config;
    accessToken = null;
    tokenExpiry = null;
    constructor(config) {
        this.config = config;
    }
    async authenticate() {
        if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
            return;
        }
        const tokenUrl = `${this.config.url}/auth/token`;
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            scope: 'all'
        });
        try {
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: params.toString()
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Authentication failed: ${response.status} - ${errorText}`);
            }
            const tokenData = await response.json();
            this.accessToken = tokenData.access_token;
            const expiryMs = (tokenData.expires_in - 60) * 1000;
            this.tokenExpiry = new Date(Date.now() + expiryMs);
        }
        catch (error) {
            throw new Error(`Failed to authenticate with HaloPSA: ${error}`);
        }
    }
    async executeQuery(sql) {
        await this.authenticate();
        const reportUrl = `${this.config.url}/api/Report`;
        const queryUrl = `${reportUrl}?tenant=${this.config.tenant}`;
        const query = {
            _loadreportonly: true,
            sql: sql
        };
        try {
            const response = await fetch(queryUrl, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
                    'authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify([query])
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Query execution failed: ${response.status} - ${errorText}`);
            }
            const result = await response.json();
            return result;
        }
        catch (error) {
            throw new Error(`Failed to execute query: ${error}`);
        }
    }
    async testConnection() {
        try {
            await this.authenticate();
            const result = await this.executeQuery('SELECT 1 as test');
            return true;
        }
        catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }
    async makeApiCall(path, method = 'GET', body, queryParams) {
        await this.authenticate();
        let url = `${this.config.url}${path}`;
        const params = new URLSearchParams({ tenant: this.config.tenant });
        if (queryParams) {
            Object.entries(queryParams).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, value);
                }
            });
        }
        const paramString = params.toString();
        if (paramString) {
            url += (path.includes('?') ? '&' : '?') + paramString;
        }
        const options = {
            method,
            headers: {
                'accept': 'application/json',
                'authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = typeof body === 'object' ? JSON.stringify(body) : body;
        }
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API call failed: ${response.status} - ${errorText}`);
            }
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            else {
                return await response.text();
            }
        }
        catch (error) {
            throw new Error(`Failed to make API call: ${error}`);
        }
    }
    async getApiSchemaOverview() {
        try {
            const swaggerModule = await import('./swagger.json');
            const schema = swaggerModule.default || swaggerModule;
            const pathGroups = {};
            const allPaths = [];
            if (schema.paths) {
                Object.entries(schema.paths).forEach(([path, pathObj]) => {
                    const methods = [];
                    let summary = '';
                    if (pathObj && typeof pathObj === 'object') {
                        Object.entries(pathObj).forEach(([method, methodObj]) => {
                            methods.push(method.toUpperCase());
                            if (!summary && methodObj?.summary) {
                                summary = methodObj.summary;
                            }
                        });
                    }
                    allPaths.push({ path, methods, summary });
                    const category = this.categorizeApiPath(path);
                    if (!pathGroups[category]) {
                        pathGroups[category] = [];
                    }
                    pathGroups[category].push(path);
                });
            }
            return {
                info: schema.info,
                servers: schema.servers,
                totalPaths: allPaths.length,
                pathGroups,
                allPaths: allPaths.slice(0, 100),
                message: "Use halopsa_get_api_endpoint_details with a specific path pattern to get full endpoint information"
            };
        }
        catch (error) {
            throw new Error(`Failed to fetch HaloPSA API schema overview: ${error}`);
        }
    }
    async getApiEndpointDetails(pathPattern, summaryOnly = false, includeSchemas = true, maxEndpoints = 10, includeExamples = false) {
        try {
            const swaggerModule = await import('./swagger.json');
            const schema = swaggerModule.default || swaggerModule;
            const matchingPaths = {};
            const pathEntries = Object.entries(schema.paths || {});
            let matchCount = 0;
            for (const [path, pathObj] of pathEntries) {
                if (matchCount >= Math.min(maxEndpoints, 50))
                    break;
                if (path.toLowerCase().includes(pathPattern.toLowerCase())) {
                    if (summaryOnly) {
                        const methods = [];
                        let summary = '';
                        if (pathObj && typeof pathObj === 'object') {
                            Object.entries(pathObj).forEach(([method, methodObj]) => {
                                methods.push(method.toUpperCase());
                                if (!summary && methodObj?.summary) {
                                    summary = methodObj.summary;
                                }
                            });
                        }
                        matchingPaths[path] = { methods, summary };
                    }
                    else {
                        const filteredPathObj = {};
                        if (pathObj && typeof pathObj === 'object') {
                            Object.entries(pathObj).forEach(([method, methodObj]) => {
                                const filteredMethodObj = {
                                    summary: methodObj?.summary,
                                    description: methodObj?.description,
                                    operationId: methodObj?.operationId,
                                    tags: methodObj?.tags
                                };
                                if (includeSchemas) {
                                    filteredMethodObj.parameters = methodObj?.parameters;
                                    filteredMethodObj.requestBody = methodObj?.requestBody;
                                    filteredMethodObj.responses = methodObj?.responses;
                                }
                                if (includeExamples && methodObj?.examples) {
                                    filteredMethodObj.examples = methodObj.examples;
                                }
                                filteredPathObj[method] = filteredMethodObj;
                            });
                        }
                        matchingPaths[path] = filteredPathObj;
                    }
                    matchCount++;
                }
            }
            const result = {
                pathPattern,
                matchingPaths,
                matchCount,
                totalMatches: pathEntries.filter(([path]) => path.toLowerCase().includes(pathPattern.toLowerCase())).length,
                limited: matchCount >= Math.min(maxEndpoints, 50)
            };
            if (includeSchemas && !summaryOnly && matchCount > 0) {
                result.components = {
                    schemas: schema.components?.schemas ?
                        Object.fromEntries(Object.entries(schema.components.schemas).slice(0, 20)) : undefined
                };
            }
            return result;
        }
        catch (error) {
            throw new Error(`Failed to fetch HaloPSA API endpoint details: ${error}`);
        }
    }
    async listApiEndpoints(category, limit = 100, skip = 0) {
        try {
            const swaggerModule = await import('./swagger.json');
            const schema = swaggerModule.default || swaggerModule;
            const allMatchingEndpoints = [];
            if (schema.paths) {
                Object.entries(schema.paths).forEach(([path, pathObj]) => {
                    if (category) {
                        const pathCategory = this.categorizeApiPath(path);
                        if (pathCategory.toLowerCase() !== category.toLowerCase()) {
                            return;
                        }
                    }
                    if (pathObj && typeof pathObj === 'object') {
                        const methods = [];
                        let primarySummary = '';
                        Object.entries(pathObj).forEach(([method, methodObj]) => {
                            methods.push(method.toUpperCase());
                            if (!primarySummary && methodObj?.summary) {
                                primarySummary = methodObj.summary;
                            }
                        });
                        allMatchingEndpoints.push({
                            path,
                            methods,
                            summary: primarySummary,
                            category: this.categorizeApiPath(path)
                        });
                    }
                });
            }
            allMatchingEndpoints.sort((a, b) => a.path.localeCompare(b.path));
            const paginatedEndpoints = allMatchingEndpoints.slice(skip, skip + limit);
            return {
                totalEndpoints: allMatchingEndpoints.length,
                endpoints: paginatedEndpoints,
                returnedCount: paginatedEndpoints.length,
                skipped: skip,
                limited: paginatedEndpoints.length >= limit,
                hasMore: skip + paginatedEndpoints.length < allMatchingEndpoints.length,
                categories: [...new Set(allMatchingEndpoints.map(e => e.category))].sort(),
                message: category ?
                    `Showing ${paginatedEndpoints.length} of ${allMatchingEndpoints.length} endpoints in category "${category}"` :
                    `Showing ${paginatedEndpoints.length} endpoints starting from position ${skip}. Total: ${allMatchingEndpoints.length}.`
            };
        }
        catch (error) {
            throw new Error(`Failed to list API endpoints: ${error}`);
        }
    }
    async searchApiEndpoints(query, limit = 50, skip = 0) {
        try {
            const swaggerModule = await import('./swagger.json');
            const schema = swaggerModule.default || swaggerModule;
            const matchingEndpoints = [];
            if (schema.paths) {
                Object.entries(schema.paths).forEach(([path, pathObj]) => {
                    if (pathObj && typeof pathObj === 'object') {
                        Object.entries(pathObj).forEach(([method, methodObj]) => {
                            const searchableText = [
                                path,
                                methodObj?.summary || '',
                                methodObj?.description || '',
                                ...(methodObj?.tags || [])
                            ].join(' ').toLowerCase();
                            if (searchableText.includes(query.toLowerCase())) {
                                matchingEndpoints.push({
                                    path,
                                    method: method.toUpperCase(),
                                    summary: methodObj?.summary,
                                    description: methodObj?.description,
                                    tags: methodObj?.tags
                                });
                            }
                        });
                    }
                });
            }
            const paginatedResults = matchingEndpoints.slice(skip, skip + limit);
            return {
                query,
                results: paginatedResults,
                returnedCount: paginatedResults.length,
                totalResults: matchingEndpoints.length,
                skipped: skip,
                hasMore: skip + paginatedResults.length < matchingEndpoints.length,
                message: `Found ${matchingEndpoints.length} endpoints matching "${query}". Showing ${paginatedResults.length} starting from position ${skip}.`
            };
        }
        catch (error) {
            throw new Error(`Failed to search API endpoints: ${error}`);
        }
    }
    async getApiSchemas(schemaPattern, limit = 50, skip = 0, listNames = false) {
        try {
            const swaggerModule = await import('./swagger.json');
            const schema = swaggerModule.default || swaggerModule;
            const schemas = {};
            const matchingSchemaNames = [];
            let schemaCount = 0;
            let skippedCount = 0;
            if (schema.components?.schemas) {
                const allSchemas = schema.components.schemas;
                Object.entries(allSchemas).forEach(([name, schemaObj]) => {
                    if (schemaPattern && !name.toLowerCase().includes(schemaPattern.toLowerCase())) {
                        return;
                    }
                    matchingSchemaNames.push(name);
                    if (skippedCount < skip) {
                        skippedCount++;
                        return;
                    }
                    if (schemaCount >= limit) {
                        return;
                    }
                    schemas[name] = schemaObj;
                    schemaCount++;
                });
            }
            const totalSchemaCount = schema.components?.schemas ?
                Object.keys(schema.components.schemas).length : 0;
            const result = {
                schemas,
                returnedCount: schemaCount,
                matchingCount: matchingSchemaNames.length,
                totalSchemasInAPI: totalSchemaCount,
                skipped: skip,
                limited: schemaCount >= limit,
                hasMore: skip + schemaCount < matchingSchemaNames.length,
                message: schemaPattern ?
                    `Showing ${schemaCount} of ${matchingSchemaNames.length} schemas matching "${schemaPattern}" (skipped ${skip})` :
                    `Showing ${schemaCount} schemas starting from position ${skip}. Total: ${totalSchemaCount}.`
            };
            if (listNames || matchingSchemaNames.length <= 20) {
                result.schemaNames = matchingSchemaNames.sort();
            }
            else {
                result.hint = `${matchingSchemaNames.length} schemas match. Set listNames=true to see all names.`;
            }
            return result;
        }
        catch (error) {
            throw new Error(`Failed to get API schemas: ${error}`);
        }
    }
    categorizeApiPath(path) {
        const lowerPath = path.toLowerCase();
        if (lowerPath.includes('/actions'))
            return 'Actions';
        if (lowerPath.includes('/ticket'))
            return 'Tickets';
        if (lowerPath.includes('/agent'))
            return 'Agents';
        if (lowerPath.includes('/client'))
            return 'Clients';
        if (lowerPath.includes('/site'))
            return 'Sites';
        if (lowerPath.includes('/user'))
            return 'Users';
        if (lowerPath.includes('/asset'))
            return 'Assets';
        if (lowerPath.includes('/invoice'))
            return 'Invoicing';
        if (lowerPath.includes('/report'))
            return 'Reports';
        if (lowerPath.includes('/address'))
            return 'Addresses';
        if (lowerPath.includes('/appointment'))
            return 'Appointments';
        if (lowerPath.includes('/project'))
            return 'Projects';
        if (lowerPath.includes('/contract'))
            return 'Contracts';
        if (lowerPath.includes('/supplier'))
            return 'Suppliers';
        if (lowerPath.includes('/product'))
            return 'Products';
        if (lowerPath.includes('/kb') || lowerPath.includes('/knowledge'))
            return 'Knowledge Base';
        if (lowerPath.includes('/integration'))
            return 'Integrations';
        if (lowerPath.includes('/webhook'))
            return 'Webhooks';
        if (lowerPath.includes('/api'))
            return 'API Management';
        return 'Other';
    }
}
