package org.entermediadb.mediaboat;

import java.awt.Dimension;
import java.awt.Toolkit;

import javax.swing.JFrame;

import org.entermediadb.mediaboat.components.LoginForm;

public class MainLaunch
{
	public MainLaunch()
	{
		// TODO Auto-generated constructor stub
	}
	

	    public static void main(final String[] args) {
	        //Schedule a job for the event-dispatching thread:
	        //creating and showing this application's GUI.
	        javax.swing.SwingUtilities.invokeLater(new Runnable() {
	            public void run() {
	                new AppController().init(args);
	            }
	        });
	    }
}
