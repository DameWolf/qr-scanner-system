<footer class="footer">
	<div class="footer-inner">
		<p>© {new Date().getFullYear()} PAMET Attendance QR Scanner.</p>
	</div>
</footer>

<style>
	.footer {
		width: 100%;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
		background: var(--bg-primary);
		padding: 0 16px;
		margin-top: auto;
		height: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
	}

	.footer-inner {
		width: 100%;
		max-width: 1400px;
		margin: 0 auto;
		text-align: center;
	}

	.footer p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 13px;
		font-weight: 500;
	}

	@media (min-width: 768px) {
		.footer {
			padding: 0 28px;
		}
		.footer-inner {
			text-align: left;
		}
	}
</style>
