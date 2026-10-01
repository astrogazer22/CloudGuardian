{{- define "cg.name" -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- end -}}

{{- define "cg.labels" -}}
app.kubernetes.io/part-of: cloudguardian
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "cg.image" -}}
{{- $root := index . 0 -}}{{- $repo := index . 1 -}}
{{- if $root.Values.imageRegistry -}}
{{ $root.Values.imageRegistry }}/{{ $repo }}:{{ $root.Values.imageTag }}
{{- else -}}
{{ $repo }}:{{ $root.Values.imageTag }}
{{- end -}}
{{- end -}}

{{- define "cg.publicUrl" -}}
{{- if .Values.host -}}
{{ ternary "https" "http" (ne .Values.ingress.certificateArn "") }}://{{ .Values.host }}
{{- end -}}
{{- end -}}

{{- define "cg.podSecurity" -}}
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
{{- end -}}

{{- define "cg.containerSecurity" -}}
securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
{{- end -}}

{{/* Env shared by the API deployment and its migrate/seed jobs. */}}
{{- define "cg.apiEnv" -}}
envFrom:
  - secretRef:
      name: {{ .Values.api.existingSecret }}
env:
  - name: PORT
    value: "4000"
  {{- range $k, $v := .Values.api.env }}
  - name: {{ $k }}
    value: {{ $v | quote }}
  {{- end }}
  {{- with include "cg.publicUrl" . }}
  - name: APP_URL
    value: {{ . | quote }}
  - name: WEB_ORIGIN
    value: {{ . | quote }}
  - name: API_PUBLIC_URL
    value: {{ printf "%s/api" . | quote }}
  {{- end }}
{{- end -}}
