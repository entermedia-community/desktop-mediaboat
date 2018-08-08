package org.entermediadb.mediaboat.components;

import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;

import javax.swing.JLabel;

public class SmoothLabel extends JLabel
{
	    String text;

	    public SmoothLabel (String text) {
	        super(text);

	        this.text = text;
	    }

	    public void paintComponent(Graphics g) {
	        Graphics2D g2d = (Graphics2D) g;
	        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

	        super.paintComponent(g2d);
	    }
	}
