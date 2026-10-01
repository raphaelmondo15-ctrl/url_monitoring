const openapiSpec = {
    openapi: "3.0.3",

    info: {
        title: "URL Monitoring API",
        version: "1.0.0",
        description:
            "API for registering URLs, monitoring their availability, tracking checks, uptime, latency, and incidents.",
    },

    servers: [
        {
            url: "/",
        },
    ],

    tags: [
        {
            name: "Monitors",
            description: "Create and manage monitored URLs",
        },
        {
            name: "Checks",
            description: "View monitor check history",
        },
        {
            name: "Uptime",
            description: "View monitor uptime and latency statistics",
        },
        {
            name: "Incidents",
            description: "View monitoring incidents",
        },
        {
            name: "Status",
            description: "Public monitoring status",
        },
        {
            name: "Health",
            description: "Application health",
        },
    ],

    paths: {
        "/health": {
            get: {
                tags: ["Health"],
                summary: "Check API health",
                responses: {
                    200: {
                        description: "API is healthy",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        status: {
                                            type: "string",
                                            example: "ok",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },

        "/monitors": {
            post: {
                tags: ["Monitors"],
                summary: "Create a monitor",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                $ref: "#/components/schemas/CreateMonitor",
                            },
                            example: {
                                name: "Google",
                                url: "https://www.google.com",
                                interval_seconds: 60,
                                expected_status: 200,
                            },
                        },
                    },
                },
                responses: {
                    201: {
                        description: "Monitor created successfully",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/Monitor",
                                },
                            },
                        },
                    },
                    400: {
                        $ref: "#/components/responses/ValidationError",
                    },
                },
            },

            get: {
                tags: ["Monitors"],
                summary: "List monitors",
                parameters: [
                    {
                        $ref: "#/components/parameters/After",
                    },
                    {
                        $ref: "#/components/parameters/Limit",
                    },
                ],
                responses: {
                    200: {
                        description: "List of monitors",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/PaginatedMonitors",
                                },
                            },
                        },
                    },
                    400: {
                        $ref: "#/components/responses/ValidationError",
                    },
                },
            },
        },

        "/monitors/{id}": {
            get: {
                tags: ["Monitors"],
                summary: "Get a monitor",
                parameters: [
                    {
                        $ref: "#/components/parameters/MonitorId",
                    },
                ],
                responses: {
                    200: {
                        description: "Monitor details",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/Monitor",
                                },
                            },
                        },
                    },
                    400: {
                        $ref: "#/components/responses/ValidationError",
                    },
                    404: {
                        $ref: "#/components/responses/NotFound",
                    },
                },
            },

            patch: {
                tags: ["Monitors"],
                summary: "Update a monitor",
                parameters: [
                    {
                        $ref: "#/components/parameters/MonitorId",
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                $ref: "#/components/schemas/UpdateMonitor",
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: "Monitor updated successfully",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/Monitor",
                                },
                            },
                        },
                    },
                    400: {
                        $ref: "#/components/responses/ValidationError",
                    },
                    404: {
                        $ref: "#/components/responses/NotFound",
                    },
                },
            },

            delete: {
                tags: ["Monitors"],
                summary: "Delete a monitor",
                parameters: [
                    {
                        $ref: "#/components/parameters/MonitorId",
                    },
                ],
                responses: {
                    200: {
                        description: "Monitor deleted successfully",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/Monitor",
                                },
                            },
                        },
                    },
                    400: {
                        $ref: "#/components/responses/ValidationError",
                    },
                    404: {
                        $ref: "#/components/responses/NotFound",
                    },
                },
            },
        },

        "/monitors/{id}/checks": {
            get: {
                tags: ["Checks"],
                summary: "Get monitor check history",
                parameters: [
                    {
                        $ref: "#/components/parameters/MonitorId",
                    },
                    {
                        $ref: "#/components/parameters/After",
                    },
                    {
                        $ref: "#/components/parameters/Limit",
                    },
                ],
                responses: {
                    200: {
                        description: "Check history",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/PaginatedChecks",
                                },
                            },
                        },
                    },
                    400: {
                        $ref: "#/components/responses/ValidationError",
                    },
                    404: {
                        $ref: "#/components/responses/NotFound",
                    },
                },
            },
        },

        "/monitors/{id}/checks.csv": {
            get: {
                tags: ["Checks"],
                summary: "Export monitor checks as CSV",
                parameters: [
                    {
                        $ref: "#/components/parameters/MonitorId",
                    },
                ],
                responses: {
                    200: {
                        description: "CSV export of monitor checks",
                        content: {
                            "text/csv": {
                                schema: {
                                    type: "string",
                                    example:
                                        "id,monitor_id,checked_at,ok,status_code,latency_ms,error",
                                },
                            },
                        },
                    },
                    400: {
                        $ref: "#/components/responses/ValidationError",
                    },
                    404: {
                        $ref: "#/components/responses/NotFound",
                    },
                },
            },
        },

        "/monitors/{id}/uptime": {
            get: {
                tags: ["Uptime"],
                summary: "Get monitor uptime statistics",
                parameters: [
                    {
                        $ref: "#/components/parameters/MonitorId",
                    },
                    {
                        name: "window",
                        in: "query",
                        required: false,
                        description: "Time window for the uptime calculation",
                        schema: {
                            type: "string",
                            example: "24h",
                        },
                    },
                ],
                responses: {
                    200: {
                        description: "Uptime and latency statistics",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/UptimeReport",
                                },
                            },
                        },
                    },
                    400: {
                        $ref: "#/components/responses/ValidationError",
                    },
                    404: {
                        $ref: "#/components/responses/NotFound",
                    },
                },
            },
        },

        "/incidents": {
            get: {
                tags: ["Incidents"],
                summary: "List all incidents",
                responses: {
                    200: {
                        description: "List of incidents",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        items: {
                                            type: "array",
                                            items: {
                                                $ref: "#/components/schemas/Incident",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },

        "/monitors/{id}/incidents": {
            get: {
                tags: ["Incidents"],
                summary: "List incidents for a monitor",
                parameters: [
                    {
                        $ref: "#/components/parameters/MonitorId",
                    },
                ],
                responses: {
                    200: {
                        description: "Monitor incidents",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        items: {
                                            type: "array",
                                            items: {
                                                $ref: "#/components/schemas/Incident",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    400: {
                        $ref: "#/components/responses/ValidationError",
                    },
                    404: {
                        $ref: "#/components/responses/NotFound",
                    },
                },
            },
        },

        "/status": {
            get: {
                tags: ["Status"],
                summary: "Get public monitoring status",
                responses: {
                    200: {
                        description: "Current status of active monitors",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        monitors: {
                                            type: "array",
                                            items: {
                                                $ref: "#/components/schemas/StatusMonitor",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },

    components: {
        parameters: {
            MonitorId: {
                name: "id",
                in: "path",
                required: true,
                description: "Monitor ID",
                schema: {
                    type: "integer",
                    minimum: 1,
                    example: 1,
                },
            },

            After: {
                name: "after",
                in: "query",
                required: false,
                description: "Return records after this ID",
                schema: {
                    type: "integer",
                    minimum: 1,
                    example: 10,
                },
            },

            Limit: {
                name: "limit",
                in: "query",
                required: false,
                description: "Number of records to return, between 1 and 100",
                schema: {
                    type: "integer",
                    minimum: 1,
                    maximum: 100,
                    default: 10,
                    example: 10,
                },
            },
        },

        schemas: {
            Monitor: {
                type: "object",
                properties: {
                    id: {
                        type: "integer",
                        example: 1,
                    },
                    name: {
                        type: "string",
                        example: "Google",
                    },
                    url: {
                        type: "string",
                        format: "uri",
                        example: "https://www.google.com",
                    },
                    interval_seconds: {
                        type: "integer",
                        example: 60,
                    },
                    expected_status: {
                        type: "integer",
                        example: 200,
                    },
                    is_active: {
                        type: "boolean",
                        example: true,
                    },
                    created_at: {
                        type: "string",
                        format: "date-time",
                    },
                },
            },

            CreateMonitor: {
                type: "object",
                required: ["name", "url"],
                properties: {
                    name: {
                        type: "string",
                        maxLength: 120,
                        example: "Google",
                    },
                    url: {
                        type: "string",
                        format: "uri",
                        example: "https://www.google.com",
                    },
                    interval_seconds: {
                        type: "integer",
                        minimum: 10,
                        maximum: 3600,
                        default: 60,
                        example: 60,
                    },
                    expected_status: {
                        type: "integer",
                        default: 200,
                        example: 200,
                    },
                },
            },

            UpdateMonitor: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        maxLength: 120,
                    },
                    url: {
                        type: "string",
                        format: "uri",
                    },
                    interval_seconds: {
                        type: "integer",
                        minimum: 10,
                        maximum: 3600,
                    },
                    expected_status: {
                        type: "integer",
                    },
                    is_active: {
                        type: "boolean",
                    },
                },
            },

            Check: {
                type: "object",
                properties: {
                    id: {
                        type: "integer",
                        example: 1,
                    },
                    monitor_id: {
                        type: "integer",
                        example: 1,
                    },
                    checked_at: {
                        type: "string",
                        format: "date-time",
                    },
                    ok: {
                        type: "boolean",
                        example: true,
                    },
                    status_code: {
                        type: "integer",
                        nullable: true,
                        example: 200,
                    },
                    latency_ms: {
                        type: "integer",
                        nullable: true,
                        example: 142,
                    },
                    error: {
                        type: "string",
                        nullable: true,
                        example: null,
                    },
                },
            },

            Incident: {
                type: "object",
                properties: {
                    id: {
                        type: "integer",
                        example: 1,
                    },
                    monitor_id: {
                        type: "integer",
                        example: 1,
                    },
                    started_at: {
                        type: "string",
                        format: "date-time",
                    },
                    resolved_at: {
                        type: "string",
                        format: "date-time",
                        nullable: true,
                    },
                    cause: {
                        type: "string",
                        nullable: true,
                        example: "Expected status 200, received 500",
                    },
                },
            },

            UptimeReport: {
                type: "object",
                properties: {
                    uptime_percentage: {
                        type: "number",
                        example: 99.5,
                    },
                    average_latency_ms: {
                        type: "number",
                        example: 145.2,
                    },
                    p95_latency_ms: {
                        type: "number",
                        example: 240,
                    },
                },
            },

            StatusMonitor: {
                type: "object",
                properties: {
                    id: {
                        type: "integer",
                        example: 1,
                    },
                    name: {
                        type: "string",
                        example: "Google",
                    },
                    url: {
                        type: "string",
                        format: "uri",
                        example: "https://www.google.com",
                    },
                    is_active: {
                        type: "boolean",
                        example: true,
                    },
                    ok: {
                        type: "boolean",
                        nullable: true,
                        example: true,
                    },
                    checked_at: {
                        type: "string",
                        format: "date-time",
                        nullable: true,
                    },
                },
            },

            PaginatedMonitors: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: {
                            $ref: "#/components/schemas/Monitor",
                        },
                    },
                    next_cursor: {
                        type: "integer",
                        nullable: true,
                        example: 10,
                    },
                },
            },

            PaginatedChecks: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: {
                            $ref: "#/components/schemas/Check",
                        },
                    },
                    next_cursor: {
                        type: "integer",
                        nullable: true,
                        example: 10,
                    },
                },
            },

            Error: {
                type: "object",
                properties: {
                    error: {
                        type: "string",
                        example: "Monitor not found",
                    },
                },
            },
        },

        responses: {
            ValidationError: {
                description: "Request validation failed",
                content: {
                    "application/json": {
                        schema: {
                            $ref: "#/components/schemas/Error",
                        },
                    },
                },
            },

            NotFound: {
                description: "Resource not found",
                content: {
                    "application/json": {
                        schema: {
                            $ref: "#/components/schemas/Error",
                        },
                    },
                },
            },
        },
    },
};

export default openapiSpec;